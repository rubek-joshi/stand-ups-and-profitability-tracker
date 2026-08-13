import { Injectable } from "@nestjs/common";
import { AmcStatus, ProjectStatus } from "@workspace/database";
import { parseIsoDate } from "../_shared/utils/date.util";
import { PrismaService } from "../prisma/prisma.service";
import { ProfitabilityService } from "../profitability/profitability.service";
import { VatService } from "../vat/vat.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly profitabilityService: ProfitabilityService,
    private readonly vatService: VatService,
  ) {}

  async getSummary(from?: string, to?: string) {
    const fromDate = from ? parseIsoDate(from) : undefined;
    const toDate = to ? parseIsoDate(to) : undefined;
    const projects = await this.prismaService.project.findMany({
      include: {
        client: true,
        projectCategories: { include: { category: true } },
      },
    });
    const results = await this.profitabilityService.calculateMany(
      projects.map((project) => project.id),
      { from: fromDate, to: toDate },
    );
    const byId = new Map(results.map((item) => [item.projectId, item]));
    let totalProfit = 0n;
    let totalLoss = 0n;
    let revenueSum = 0n;
    let profitLossSum = 0n;
    const ranked = projects.map((project) => {
      const pl = byId.get(project.id)!;
      if (pl.profitLossPaisa > 0n) {
        totalProfit += pl.profitLossPaisa;
      } else if (pl.profitLossPaisa < 0n) {
        totalLoss += -pl.profitLossPaisa;
      }
      revenueSum += pl.revenuePaisa;
      profitLossSum += pl.profitLossPaisa;
      const categoryNames = project.projectCategories.map(
        (row) => row.category.name,
      );
      return {
        id: project.id,
        name: project.name,
        clientName: project.client.name,
        categoryName: categoryNames.join(", "),
        categoryNames,
        status: project.status,
        profitLossPaisa: String(pl.profitLossPaisa),
        marginPercent: pl.marginPercent,
        isTrendingOverBudget: pl.isTrendingOverBudget,
      };
    });
    const profitable = [...ranked]
      .sort((a, b) => Number(BigInt(b.profitLossPaisa) - BigInt(a.profitLossPaisa)))
      .filter((item) => BigInt(item.profitLossPaisa) > 0n)
      .slice(0, 5);
    const lossMaking = [...ranked]
      .sort((a, b) => Number(BigInt(a.profitLossPaisa) - BigInt(b.profitLossPaisa)))
      .filter((item) => BigInt(item.profitLossPaisa) < 0n)
      .slice(0, 5);
    const categoryMap = new Map<
      string,
      { categoryId: string; name: string; profitLossPaisa: bigint }
    >();
    for (const project of projects) {
      const pl = byId.get(project.id)!;
      for (const row of project.projectCategories) {
        const existing = categoryMap.get(row.categoryId) ?? {
          categoryId: row.categoryId,
          name: row.category.name,
          profitLossPaisa: 0n,
        };
        // Full project P/L is attributed to each linked category (tagging model).
        existing.profitLossPaisa += pl.profitLossPaisa;
        categoryMap.set(row.categoryId, existing);
      }
    }
    const vat = await this.vatService.getAccumulatedUnpaid();
    const amcReminders = await this.prismaService.amcRecord.findMany({
      where: {
        status: {
          in: [AmcStatus.reminder_due, AmcStatus.overdue],
        },
      },
      include: { project: { include: { client: true } } },
      orderBy: { freeUntilDate: "asc" },
    });
    const overallMarginPercent =
      revenueSum === 0n
        ? 0
        : Number((profitLossSum * 10000n) / revenueSum) / 100;
    return {
      totalProfitPaisa: String(totalProfit),
      totalLossPaisa: String(totalLoss),
      overallMarginPercent,
      activeCount: projects.filter(
        (p) =>
          p.status === ProjectStatus.active ||
          p.status === ProjectStatus.extended,
      ).length,
      closedCount: projects.filter(
        (p) =>
          p.status === ProjectStatus.closed ||
          p.status === ProjectStatus.under_amc,
      ).length,
      top5Profitable: profitable,
      top5LossMaking: lossMaking,
      trendingOverBudget: ranked.filter((item) => item.isTrendingOverBudget),
      accumulatedVat: vat,
      amcReminders: amcReminders.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        projectName: item.project.name,
        clientName: item.project.client.name,
        status: item.status,
        freeUntilDate: item.freeUntilDate,
        amcAmountPaisa:
          item.amcAmountPaisa === null ? null : String(item.amcAmountPaisa),
      })),
      categoryBreakdown: [...categoryMap.values()].map((item) => ({
        categoryId: item.categoryId,
        categoryName: item.name,
        profitLossPaisa: String(item.profitLossPaisa),
      })),
    };
  }
}
