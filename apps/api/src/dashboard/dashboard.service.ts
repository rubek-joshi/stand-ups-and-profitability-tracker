import { Injectable } from "@nestjs/common";
import {
  AmcStatus,
  AmcType,
  ClientStatus,
  PersonStatus,
  ProjectStatus,
} from "@workspace/database";
import { parseIsoDate, toIsoDate } from "../_shared/utils/date.util";
import { PrismaService } from "../prisma/prisma.service";
import { ProfitabilityService } from "../profitability/profitability.service";
import { VatService } from "../vat/vat.service";

type MonthBucket = {
  key: string;
  from: Date;
  to: Date;
  label: string;
};

/** Split a paisa amount evenly; remainder paisa go to the first categories. */
function splitPaisaEvenly(total: bigint, count: number): bigint[] {
  if (count <= 0) {
    return [];
  }
  const base = total / BigInt(count);
  let remainder = total - base * BigInt(count);
  const shares = Array.from({ length: count }, () => base);
  if (remainder === 0n) {
    return shares;
  }
  const step = remainder > 0n ? 1n : -1n;
  for (let i = 0; i < shares.length && remainder !== 0n; i += 1) {
    shares[i] += step;
    remainder -= step;
  }
  return shares;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly profitabilityService: ProfitabilityService,
    private readonly vatService: VatService,
  ) {}

  async getSummary(
    from?: string,
    to?: string,
    options: { includeAudit?: boolean } = {},
  ) {
    const fromDate = from ? parseIsoDate(from) : undefined;
    const toDate = to ? parseIsoDate(to) : undefined;
    const standupDateFilter =
      fromDate || toDate
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        : undefined;

    const projects = await this.prismaService.project.findMany({
      include: {
        client: true,
        projectCategories: { include: { category: true } },
      },
    });
    const projectIds = projects.map((project) => project.id);

    const [
      results,
      vat,
      amcReminders,
      amcContracts,
      activeClients,
      totalEmployees,
      employeeGroups,
      totalStandups,
      recentStandups,
      recentAudit,
      profitTrend,
    ] = await Promise.all([
      this.profitabilityService.calculateMany(projectIds, {
        from: fromDate,
        to: toDate,
      }),
      this.vatService.getAccumulatedUnpaid(),
      this.prismaService.amcRecord.findMany({
        where: {
          status: {
            in: [AmcStatus.reminder_due, AmcStatus.overdue],
          },
        },
        include: { project: { include: { client: true } } },
        orderBy: { endDate: "asc" },
      }),
      this.prismaService.amcRecord.findMany({
        where: { status: { not: AmcStatus.cancelled } },
        include: { project: { include: { client: true } } },
        orderBy: { endDate: "asc" },
      }),
      this.prismaService.client.count({
        where: { status: ClientStatus.active },
      }),
      this.prismaService.employee.count({
        where: { status: PersonStatus.active },
      }),
      this.prismaService.employeeGroup.findMany({
        include: { _count: { select: { members: true } } },
        orderBy: { name: "asc" },
      }),
      this.prismaService.standup.count({
        where: {
          ...(standupDateFilter ? { date: standupDateFilter } : {}),
        },
      }),
      this.prismaService.standup.findMany({
        where: {
          ...(standupDateFilter ? { date: standupDateFilter } : {}),
        },
        include: {
          createdBy: { select: { name: true } },
          employeeGroup: { select: { name: true } },
          _count: { select: { entries: true } },
        },
        orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      options.includeAudit
        ? this.prismaService.auditLog.findMany({
            include: {
              actor: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      this.buildProfitTrend(projectIds, fromDate, toDate),
    ]);

    const byId = new Map(results.map((item) => [item.projectId, item]));
    let totalProfit = 0n;
    let totalLoss = 0n;
    let revenueSum = 0n;
    let profitLossSum = 0n;
    let contractedRevenueSum = 0n;
    let contractedProfitLossSum = 0n;
    const ranked = projects.map((project) => {
      const pl = byId.get(project.id)!;
      if (pl.profitLossPaisa > 0n) {
        totalProfit += pl.profitLossPaisa;
      } else if (pl.profitLossPaisa < 0n) {
        totalLoss += -pl.profitLossPaisa;
      }
      revenueSum += pl.revenuePaisa;
      profitLossSum += pl.profitLossPaisa;
      contractedRevenueSum += pl.contractedRevenuePaisa;
      contractedProfitLossSum += pl.contractedProfitLossPaisa;
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
        contractedProfitLossPaisa: String(pl.contractedProfitLossPaisa),
        contractedMarginPercent: pl.contractedMarginPercent,
        isTrendingOverBudget: pl.isTrendingOverBudget,
      };
    });
    const profitable = [...ranked]
      .sort((a, b) =>
        Number(BigInt(b.profitLossPaisa) - BigInt(a.profitLossPaisa)),
      )
      .filter((item) => BigInt(item.profitLossPaisa) > 0n)
      .slice(0, 5);
    const lossMaking = [...ranked]
      .sort((a, b) =>
        Number(BigInt(a.profitLossPaisa) - BigInt(b.profitLossPaisa)),
      )
      .filter((item) => BigInt(item.profitLossPaisa) < 0n)
      .slice(0, 5);
    const categoryMap = new Map<
      string,
      { categoryId: string; name: string; profitLossPaisa: bigint }
    >();
    for (const project of projects) {
      const pl = byId.get(project.id)!;
      const categories = project.projectCategories;
      if (categories.length === 0) {
        continue;
      }
      const shares = splitPaisaEvenly(pl.profitLossPaisa, categories.length);
      categories.forEach((row, index) => {
        const existing = categoryMap.get(row.categoryId) ?? {
          categoryId: row.categoryId,
          name: row.category.name,
          profitLossPaisa: 0n,
        };
        existing.profitLossPaisa += shares[index] ?? 0n;
        categoryMap.set(row.categoryId, existing);
      });
    }

    const activeAmcRecords = amcContracts.filter(
      (item) =>
        item.status !== AmcStatus.cancelled &&
        item.status !== AmcStatus.paid_pending,
    );
    const amcValue = activeAmcRecords.reduce(
      (sum, item) => sum + (item.amcAmountPaisa ?? 0n),
      0n,
    );

    const computedMargin =
      revenueSum === 0n
        ? 0
        : Number((profitLossSum * 10000n) / revenueSum) / 100;
    const overallMarginPercent = Number.isFinite(computedMargin)
      ? computedMargin
      : 0;

    const computedContractedMargin =
      contractedRevenueSum === 0n
        ? 0
        : Number((contractedProfitLossSum * 10000n) / contractedRevenueSum) / 100;
    const overallContractedMarginPercent = Number.isFinite(computedContractedMargin)
      ? computedContractedMargin
      : 0;

    const clientsWithActiveProjects = new Set(
      projects
        .filter(
          (p) =>
            p.status === ProjectStatus.active ||
            p.status === ProjectStatus.extended,
        )
        .map((p) => p.clientId),
    ).size;

    const closedProjectIds = new Set(
      projects
        .filter(
          (p) =>
            p.status === ProjectStatus.closed ||
            p.status === ProjectStatus.under_amc,
        )
        .map((p) => p.id),
    );
    const latestAmcByClosedProject = new Map<
      string,
      (typeof amcContracts)[number]
    >();
    for (const amc of amcContracts) {
      if (!closedProjectIds.has(amc.projectId)) {
        continue;
      }
      const existing = latestAmcByClosedProject.get(amc.projectId);
      if (!existing || amc.endDate > existing.endDate) {
        latestAmcByClosedProject.set(amc.projectId, amc);
      }
    }
    let closedFreeAmcCount = 0;
    let closedPaidAmcCount = 0;
    for (const amc of latestAmcByClosedProject.values()) {
      if (amc.type === AmcType.complimentary) {
        closedFreeAmcCount += 1;
      } else if (amc.type === AmcType.paid) {
        closedPaidAmcCount += 1;
      }
    }

    return {
      totalProfitPaisa: String(totalProfit),
      totalLossPaisa: String(totalLoss),
      netProfitLossPaisa: String(profitLossSum),
      totalRevenuePaisa: String(revenueSum),
      overallMarginPercent,
      contractedRevenuePaisa: String(contractedRevenueSum),
      contractedNetProfitLossPaisa: String(contractedProfitLossSum),
      overallContractedMarginPercent,
      activeClients,
      clientsWithActiveProjects,
      activeCount: projects.filter(
        (p) =>
          p.status === ProjectStatus.active ||
          p.status === ProjectStatus.extended,
      ).length,
      closedCount: closedProjectIds.size,
      closedFreeAmcCount,
      closedPaidAmcCount,
      totalEmployees,
      totalStandups,
      amcValuePaisa: String(amcValue),
      activeAmcs: activeAmcRecords.length,
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
        endDate: item.endDate,
        amcAmountPaisa:
          item.amcAmountPaisa === null ? null : String(item.amcAmountPaisa),
      })),
      amcContracts: amcContracts.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        projectName: item.project.name,
        clientName: item.project.client.name,
        status: item.status,
        endDate: item.endDate,
        amcAmountPaisa:
          item.amcAmountPaisa === null ? null : String(item.amcAmountPaisa),
      })),
      categoryBreakdown: [...categoryMap.values()].map((item) => ({
        categoryId: item.categoryId,
        categoryName: item.name,
        profitLossPaisa: String(item.profitLossPaisa),
      })),
      groupCounts: employeeGroups.map((group) => ({
        groupId: group.id,
        groupName: group.name,
        count: group._count.members,
      })),
      profitTrend,
      recentStandups: recentStandups.map((item) => ({
        id: item.id,
        date: toIsoDate(item.date),
        authorName: item.createdBy.name,
        groupName: item.employeeGroup?.name ?? "All employees",
        entryCount: item._count.entries,
      })),
      recentAudit: recentAudit.map((item) => ({
        id: item.id,
        action: item.action,
        targetType: item.targetType,
        targetId: item.targetId,
        createdAt: item.createdAt.toISOString(),
        actorName: item.actor?.name ?? item.actor?.email ?? "System",
      })),
      canViewAudit: Boolean(options.includeAudit),
    };
  }

  private monthBuckets(fromDate?: Date, toDate?: Date): MonthBucket[] {
    const end = toDate ?? new Date();
    const start =
      fromDate ??
      new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));

    const buckets: MonthBucket[] = [];
    let cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    const endMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1),
    );

    while (cursor <= endMonth && buckets.length < 24) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const bucketFrom = monthStart < start ? start : monthStart;
      const bucketTo = monthEnd > end ? end : monthEnd;
      buckets.push({
        key: `${year}-${String(month + 1).padStart(2, "0")}`,
        from: bucketFrom,
        to: bucketTo,
        label: new Date(Date.UTC(year, month, 15)).toLocaleString("en", {
          month: "short",
        }),
      });
      cursor = new Date(Date.UTC(year, month + 1, 1));
    }

    return buckets;
  }

  private async buildProfitTrend(
    projectIds: string[],
    fromDate?: Date,
    toDate?: Date,
  ) {
    if (projectIds.length === 0) {
      return [];
    }

    const buckets = this.monthBuckets(fromDate, toDate);
    const trend = await Promise.all(
      buckets.map(async (bucket) => {
        const results = await this.profitabilityService.calculateMany(
          projectIds,
          { from: bucket.from, to: bucket.to },
        );
        let revenue = 0n;
        let profit = 0n;
        for (const row of results) {
          revenue += row.revenuePaisa;
          profit += row.profitLossPaisa;
        }
        return {
          label: bucket.label,
          month: bucket.key,
          revenuePaisa: String(revenue),
          profitLossPaisa: String(profit),
        };
      }),
    );
    return trend;
  }
}
