import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AmcStatus,
  AuditAction,
  ProjectStatus,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { parseIsoDate } from "../_shared/utils/date.util";
import { nprToPaisa } from "../_shared/utils/money.util";
import { serializeMoneyFields } from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { CancelAmcDto, SetAmcDto, UpdateAmcDto } from "./dto/amc.dto";

const AMC_MONEY_FIELDS = ["amcAmountPaisa"] as const;

@Injectable()
export class AmcService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async setOnProject(projectId: string, dto: SetAmcDto, actorId: string) {
    const project = await this.prismaService.project.findUnique({
      where: { id: projectId },
      include: { amcRecord: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (project.status !== ProjectStatus.closed) {
      throw new BadRequestException("AMC can only be set on closed projects");
    }
    if (project.amcRecord) {
      throw new BadRequestException("Project already has an AMC record");
    }
    const settings = await this.prismaService.orgSettings.findFirst();
    const status = this.deriveStatus(
      parseIsoDate(dto.freeUntilDate),
      settings?.amcReminderLeadDays ?? 7,
    );
    const record = await this.prismaService.$transaction(async (tx) => {
      const amc = await tx.amcRecord.create({
        data: {
          projectId,
          setDate: parseIsoDate(dto.setDate),
          freeUntilDate: parseIsoDate(dto.freeUntilDate),
          isVatApplicable: dto.isVatApplicable ?? true,
          amcAmountPaisa:
            dto.amcAmountNpr === undefined
              ? null
              : nprToPaisa(dto.amcAmountNpr),
          status,
        },
      });
      await tx.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.under_amc },
      });
      return amc;
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_SET,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: { after: this.serialize(record) },
    });
    return this.serialize(record);
  }

  async update(projectId: string, dto: UpdateAmcDto, actorId: string) {
    const before = await this.getOrThrow(projectId);
    let status = dto.status;
    if (!status && dto.freeUntilDate) {
      const settings = await this.prismaService.orgSettings.findFirst();
      status = this.deriveStatus(
        parseIsoDate(dto.freeUntilDate),
        settings?.amcReminderLeadDays ?? 7,
      );
    }
    const record = await this.prismaService.amcRecord.update({
      where: { projectId },
      data: {
        status,
        freeUntilDate: dto.freeUntilDate
          ? parseIsoDate(dto.freeUntilDate)
          : undefined,
        amcAmountPaisa:
          dto.amcAmountNpr === undefined
            ? undefined
            : nprToPaisa(dto.amcAmountNpr),
        isVatApplicable: dto.isVatApplicable,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_UPDATED,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: {
        before: this.serialize(before),
        after: this.serialize(record),
      },
    });
    return this.serialize(record);
  }

  async cancel(projectId: string, dto: CancelAmcDto, actorId: string) {
    const before = await this.getOrThrow(projectId);
    if (before.status === AmcStatus.cancelled) {
      throw new BadRequestException("AMC is already cancelled");
    }
    const record = await this.prismaService.amcRecord.update({
      where: { projectId },
      data: {
        status: AmcStatus.cancelled,
        cancelledAt: new Date(),
        cancelledRemark: dto.remark,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_CANCELLED,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: {
        before: this.serialize(before),
        after: this.serialize(record),
      },
    });
    return this.serialize(record);
  }

  async findByProject(projectId: string) {
    const record = await this.getOrThrow(projectId);
    return this.serialize(record);
  }

  /** Recompute AMC status from free-until date and reminder lead days. */
  deriveStatus(freeUntilDate: Date, reminderLeadDays: number): AmcStatus {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const freeUntil = new Date(freeUntilDate);
    freeUntil.setUTCHours(0, 0, 0, 0);
    if (today > freeUntil) {
      return AmcStatus.overdue;
    }
    const leadMs = reminderLeadDays * 86_400_000;
    const reminderStart = new Date(freeUntil.getTime() - leadMs);
    if (today >= reminderStart) {
      return AmcStatus.reminder_due;
    }
    return AmcStatus.free_period;
  }

  private async getOrThrow(projectId: string) {
    const record = await this.prismaService.amcRecord.findUnique({
      where: { projectId },
    });
    if (!record) {
      throw new NotFoundException(`AMC for project ${projectId} not found`);
    }
    return record;
  }

  private serialize<T extends { amcAmountPaisa: bigint | null }>(record: T) {
    if (record.amcAmountPaisa === null) {
      return record;
    }
    return serializeMoneyFields(
      { ...record, amcAmountPaisa: record.amcAmountPaisa },
      AMC_MONEY_FIELDS,
    );
  }
}
