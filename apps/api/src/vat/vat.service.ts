import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { AmcStatus, AuditAction } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { parseIsoDate, toIsoDate } from "../_shared/utils/date.util";
import { nprToPaisa } from "../_shared/utils/money.util";
import {
  serializeMoneyFields,
  serializeMoneyList,
} from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { MarkVatPaidDto } from "./dto/mark-vat-paid.dto";

const CLEARANCE_FIELDS = ["amountPaisa"] as const;

export type VatAccrualEntry = {
  id: string;
  description: string;
  amountPaisa: string;
  occurredAt: string;
  sourceType: "project" | "extension" | "amc";
  sourceId: string;
};

@Injectable()
export class VatService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getAccumulatedUnpaid(filters: { from?: string; to?: string } = {}) {
    const entries = await this.buildAccrualEntries();
    const clearances = await this.prismaService.vatClearance.findMany({
      orderBy: { clearedAt: "desc" },
    });

    const accrued = entries.reduce(
      (sum, item) => sum + BigInt(item.amountPaisa),
      0n,
    );
    const cleared = clearances.reduce(
      (sum, item) => sum + item.amountPaisa,
      0n,
    );
    const unpaid = accrued > cleared ? accrued - cleared : 0n;

    const from = filters.from ? parseIsoDate(filters.from) : undefined;
    const to = filters.to ? parseIsoDate(filters.to) : undefined;
    if (from && to && to.getTime() < from.getTime()) {
      throw new BadRequestException("`to` must be on or after `from`");
    }

    const hasPeriod = Boolean(from || to);
    const periodEntries = hasPeriod
      ? entries.filter((e) => this.isInRange(e.occurredAt, from, to))
      : entries;
    const periodClearances = hasPeriod
      ? clearances.filter((c) =>
          this.isInRange(toIsoDate(c.clearedAt), from, to),
        )
      : clearances;

    const periodAccrued = periodEntries.reduce(
      (sum, item) => sum + BigInt(item.amountPaisa),
      0n,
    );
    const periodCleared = periodClearances.reduce(
      (sum, item) => sum + item.amountPaisa,
      0n,
    );
    const periodUnpaid =
      periodAccrued > periodCleared ? periodAccrued - periodCleared : 0n;

    return {
      accruedPaisa: String(accrued),
      clearedPaisa: String(cleared),
      unpaidPaisa: String(unpaid),
      period: hasPeriod
        ? {
            accruedPaisa: String(periodAccrued),
            clearedPaisa: String(periodCleared),
            unpaidPaisa: String(periodUnpaid),
          }
        : null,
    };
  }

  async listEntries(filters: { from?: string; to?: string } = {}) {
    const from = filters.from ? parseIsoDate(filters.from) : undefined;
    const to = filters.to ? parseIsoDate(filters.to) : undefined;
    if (from && to && to.getTime() < from.getTime()) {
      throw new BadRequestException("`to` must be on or after `from`");
    }
    const entries = await this.buildAccrualEntries();
    const filtered =
      from || to
        ? entries.filter((e) => this.isInRange(e.occurredAt, from, to))
        : entries;
    return filtered;
  }

  async markPaid(dto: MarkVatPaidDto, actorId: string) {
    const unpaid = await this.getAccumulatedUnpaid();
    const unpaidPaisa = BigInt(unpaid.unpaidPaisa);
    if (unpaidPaisa <= 0n) {
      throw new BadRequestException("There is no unpaid VAT to clear");
    }

    let amountPaisa = unpaidPaisa;
    if (dto.amountNpr !== undefined) {
      amountPaisa = nprToPaisa(dto.amountNpr);
      if (amountPaisa <= 0n) {
        throw new BadRequestException("Clearance amount must be greater than 0");
      }
      if (amountPaisa > unpaidPaisa) {
        throw new BadRequestException(
          "Clearance amount cannot exceed outstanding VAT",
        );
      }
    }

    const clearance = await this.prismaService.vatClearance.create({
      data: {
        amountPaisa,
        clearedById: actorId,
        note: dto.note?.trim() || null,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.VAT_CLEARED,
      targetType: "VatClearance",
      targetId: clearance.id,
      metadata: {
        after: serializeMoneyFields(clearance, CLEARANCE_FIELDS),
      },
    });
    return serializeMoneyFields(clearance, CLEARANCE_FIELDS);
  }

  async listClearances(filters: { from?: string; to?: string } = {}) {
    const from = filters.from ? parseIsoDate(filters.from) : undefined;
    const to = filters.to ? parseIsoDate(filters.to) : undefined;
    if (from && to && to.getTime() < from.getTime()) {
      throw new BadRequestException("`to` must be on or after `from`");
    }

    const clearances = await this.prismaService.vatClearance.findMany({
      where: {
        ...(from || to
          ? {
              clearedAt: {
                ...(from ? { gte: from } : {}),
                ...(to
                  ? {
                      lte: new Date(
                        Date.UTC(
                          to.getUTCFullYear(),
                          to.getUTCMonth(),
                          to.getUTCDate(),
                          23,
                          59,
                          59,
                          999,
                        ),
                      ),
                    }
                  : {}),
              },
            }
          : {}),
      },
      orderBy: { clearedAt: "desc" },
      include: {
        clearedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return serializeMoneyList(clearances, CLEARANCE_FIELDS);
  }

  /** @deprecated Prefer buildAccrualEntries — kept for dashboard totals. */
  async calculateAccruedVatPaisa(): Promise<bigint> {
    const entries = await this.buildAccrualEntries();
    return entries.reduce((sum, item) => sum + BigInt(item.amountPaisa), 0n);
  }

  private async buildAccrualEntries(): Promise<VatAccrualEntry[]> {
    const projects = await this.prismaService.project.findMany({
      where: { isVatApplicable: true },
      include: {
        client: { select: { name: true } },
        extensions: true,
      },
      orderBy: { startDate: "desc" },
    });

    const entries: VatAccrualEntry[] = [];
    for (const project of projects) {
      const baseVat =
        (project.budgetPaisa * BigInt(project.vatRateApplied)) / 100n;
      if (baseVat > 0n) {
        entries.push({
          id: `project:${project.id}`,
          description: `${project.name} · ${project.client.name} (budget)`,
          amountPaisa: String(baseVat),
          occurredAt: toIsoDate(project.startDate),
          sourceType: "project",
          sourceId: project.id,
        });
      }
      for (const extension of project.extensions) {
        const extVat =
          (extension.amountPaisa * BigInt(project.vatRateApplied)) / 100n;
        if (extVat <= 0n) continue;
        entries.push({
          id: `extension:${extension.id}`,
          description: `${project.name} · extension (${extension.reason})`,
          amountPaisa: String(extVat),
          occurredAt: toIsoDate(extension.createdAt),
          sourceType: "extension",
          sourceId: extension.id,
        });
      }
    }

    const settings = await this.prismaService.orgSettings.findFirst();
    const amcRate = settings?.vatRatePercent ?? 13;
    const amcs = await this.prismaService.amcRecord.findMany({
      where: {
        isVatApplicable: true,
        amcAmountPaisa: { not: null },
        status: { not: AmcStatus.cancelled },
      },
      include: {
        project: {
          include: { client: { select: { name: true } } },
        },
      },
      orderBy: { startDate: "desc" },
    });
    for (const amc of amcs) {
      if (amc.amcAmountPaisa === null) continue;
      const amcVat = (amc.amcAmountPaisa * BigInt(amcRate)) / 100n;
      if (amcVat <= 0n) continue;
      entries.push({
        id: `amc:${amc.id}`,
        description: `${amc.project.name} · ${amc.project.client.name} (AMC)`,
        amountPaisa: String(amcVat),
        occurredAt: toIsoDate(amc.startDate),
        sourceType: "amc",
        sourceId: amc.id,
      });
    }

    entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return entries;
  }

  private isInRange(
    isoDate: string,
    from?: Date,
    to?: Date,
  ): boolean {
    const day = parseIsoDate(String(isoDate).slice(0, 10));
    if (from && day.getTime() < from.getTime()) return false;
    if (to && day.getTime() > to.getTime()) return false;
    return true;
  }
}
