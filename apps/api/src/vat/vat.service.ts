import { Injectable } from "@nestjs/common";
import { AmcStatus, AuditAction } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { serializeMoneyFields, serializeMoneyList } from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { MarkVatPaidDto } from "./dto/mark-vat-paid.dto";

const CLEARANCE_FIELDS = ["amountPaisa"] as const;

@Injectable()
export class VatService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getAccumulatedUnpaid() {
    const accrued = await this.calculateAccruedVatPaisa();
    const clearances = await this.prismaService.vatClearance.findMany();
    const cleared = clearances.reduce(
      (sum, item) => sum + item.amountPaisa,
      0n,
    );
    const unpaid = accrued > cleared ? accrued - cleared : 0n;
    return {
      accruedPaisa: String(accrued),
      clearedPaisa: String(cleared),
      unpaidPaisa: String(unpaid),
    };
  }

  async markPaid(dto: MarkVatPaidDto, actorId: string) {
    const unpaid = await this.getAccumulatedUnpaid();
    const amountPaisa = BigInt(unpaid.unpaidPaisa);
    const clearance = await this.prismaService.vatClearance.create({
      data: {
        amountPaisa,
        clearedById: actorId,
        note: dto.note,
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

  async listClearances() {
    const clearances = await this.prismaService.vatClearance.findMany({
      orderBy: { clearedAt: "desc" },
      include: {
        clearedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return serializeMoneyList(clearances, CLEARANCE_FIELDS);
  }

  async calculateAccruedVatPaisa(): Promise<bigint> {
    const projects = await this.prismaService.project.findMany({
      where: { isVatApplicable: true },
      include: { extensions: true },
    });
    let total = 0n;
    for (const project of projects) {
      const base =
        project.budgetPaisa +
        project.extensions.reduce((sum, ext) => sum + ext.amountPaisa, 0n);
      total += (base * BigInt(project.vatRateApplied)) / 100n;
    }
    const settings = await this.prismaService.orgSettings.findFirst();
    const amcRate = settings?.vatRatePercent ?? 13;
    const amcs = await this.prismaService.amcRecord.findMany({
      where: {
        isVatApplicable: true,
        amcAmountPaisa: { not: null },
        status: { not: AmcStatus.cancelled },
      },
    });
    for (const amc of amcs) {
      if (amc.amcAmountPaisa === null) {
        continue;
      }
      total += (amc.amcAmountPaisa * BigInt(amcRate)) / 100n;
    }
    return total;
  }
}
