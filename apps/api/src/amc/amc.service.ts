import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AmcRenewalDecision,
  AmcStatus,
  AmcType,
  AuditAction,
  ProjectStatus,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { parseIsoDate } from "../_shared/utils/date.util";
import { nprToPaisa } from "../_shared/utils/money.util";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { serializeMoneyFields } from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  CancelAmcDto,
  CreateAmcDto,
  RenewalDecisionDto,
  SetAmcDto,
  UpdateAmcDto,
} from "./dto/amc.dto";

const AMC_MONEY_FIELDS = ["amcAmountPaisa"] as const;

const projectInclude = {
  client: { select: { id: true, name: true } },
} as const;

@Injectable()
export class AmcService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(filters: {
    q?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  } = {}) {
    const q = filters.q?.trim();
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const where = {
      ...(filters.status
        ? { status: filters.status as AmcStatus }
        : {}),
      ...(q
        ? {
            OR: [
              { notes: { contains: q, mode: "insensitive" as const } },
              {
                project: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
              {
                project: {
                  client: {
                    name: { contains: q, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [records, total] = await Promise.all([
      this.prismaService.amcRecord.findMany({
        where,
        include: { project: { include: projectInclude } },
        orderBy: [{ endDate: "asc" }, { createdAt: "desc" }],
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.amcRecord.count({ where }),
    ]);
    return paginatedResult(
      records.map((r) => this.serializeWithProject(r)),
      total,
      pagination,
    );
  }

  async create(dto: CreateAmcDto, actorId: string) {
    return this.createForProject(
      dto.projectId,
      {
        type: dto.type,
        startDate: dto.startDate,
        endDate: dto.endDate,
        notes: dto.notes,
        isVatApplicable: dto.isVatApplicable,
        amcAmountNpr: dto.amcAmountNpr,
      },
      actorId,
    );
  }

  async setOnProject(projectId: string, dto: SetAmcDto, actorId: string) {
    const startDate = dto.startDate ?? dto.setDate;
    const endDate = dto.endDate ?? dto.freeUntilDate;
    if (!startDate || !endDate) {
      throw new BadRequestException("startDate and endDate are required");
    }
    return this.createForProject(
      projectId,
      {
        type: dto.type ?? AmcType.complimentary,
        startDate,
        endDate,
        notes: dto.notes,
        isVatApplicable: dto.isVatApplicable,
        amcAmountNpr: dto.amcAmountNpr,
      },
      actorId,
    );
  }

  private async createForProject(
    projectId: string,
    dto: {
      type: AmcType;
      startDate: string;
      endDate: string;
      notes?: string;
      isVatApplicable?: boolean;
      amcAmountNpr?: number;
    },
    actorId: string,
  ) {
    const project = await this.prismaService.project.findUnique({
      where: { id: projectId },
      include: projectInclude,
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (
      project.status !== ProjectStatus.closed &&
      project.status !== ProjectStatus.under_amc
    ) {
      throw new BadRequestException(
        "AMC can only be set on closed or under-AMC projects",
      );
    }

    const running = await this.findRunningAmc(projectId);
    if (running) {
      throw new BadRequestException(
        "Project already has a running AMC. Cancel or decline it before creating another.",
      );
    }

    const start = parseIsoDate(dto.startDate);
    const end = parseIsoDate(dto.endDate);
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException("endDate must be on or after startDate");
    }

    if (dto.type === AmcType.paid && dto.amcAmountNpr === undefined) {
      throw new BadRequestException("Paid AMC requires an amount");
    }

    const settings = await this.prismaService.orgSettings.findFirst();
    const status =
      dto.type === AmcType.paid
        ? AmcStatus.paid_pending
        : this.deriveStatus(end, settings?.amcReminderLeadDays ?? 7);

    const record = await this.prismaService.$transaction(async (tx) => {
      const amc = await tx.amcRecord.create({
        data: {
          projectId,
          type: dto.type,
          startDate: start,
          endDate: end,
          notes: dto.notes?.trim() || null,
          isVatApplicable: dto.isVatApplicable ?? true,
          amcAmountPaisa:
            dto.amcAmountNpr === undefined
              ? null
              : nprToPaisa(dto.amcAmountNpr),
          status,
          renewalDecision:
            status === AmcStatus.overdue || status === AmcStatus.reminder_due
              ? AmcRenewalDecision.pending
              : null,
        },
        include: { project: { include: projectInclude } },
      });
      if (project.status !== ProjectStatus.under_amc) {
        await tx.project.update({
          where: { id: projectId },
          data: { status: ProjectStatus.under_amc },
        });
      }
      return amc;
    });

    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_SET,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: { after: this.serializeWithProject(record) },
    });
    return this.serializeWithProject(record);
  }

  async update(id: string, dto: UpdateAmcDto, actorId: string) {
    const before = await this.getByIdOrThrow(id);
    if (before.status === AmcStatus.cancelled) {
      throw new BadRequestException("Cannot update a cancelled AMC");
    }

    let status = dto.status;
    const endDate = dto.endDate ? parseIsoDate(dto.endDate) : before.endDate;
    if (!status && dto.endDate) {
      const settings = await this.prismaService.orgSettings.findFirst();
      status = this.deriveStatus(endDate, settings?.amcReminderLeadDays ?? 7);
    }

    const record = await this.prismaService.amcRecord.update({
      where: { id },
      data: {
        status,
        type: dto.type,
        startDate: dto.startDate ? parseIsoDate(dto.startDate) : undefined,
        endDate: dto.endDate ? parseIsoDate(dto.endDate) : undefined,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        amcAmountPaisa:
          dto.amcAmountNpr === undefined
            ? undefined
            : nprToPaisa(dto.amcAmountNpr),
        isVatApplicable: dto.isVatApplicable,
        renewalDecision: dto.renewalDecision,
      },
      include: { project: { include: projectInclude } },
    });

    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_UPDATED,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: {
        before: this.serialize(before),
        after: this.serializeWithProject(record),
      },
    });
    return this.serializeWithProject(record);
  }

  /** Legacy project-scoped update */
  async updateByProject(
    projectId: string,
    dto: UpdateAmcDto,
    actorId: string,
  ) {
    const running = await this.findRunningAmc(projectId);
    if (!running) {
      throw new NotFoundException(`Running AMC for project ${projectId} not found`);
    }
    return this.update(running.id, dto, actorId);
  }

  async cancel(id: string, dto: CancelAmcDto, actorId: string) {
    const before = await this.getByIdOrThrow(id);
    if (before.status === AmcStatus.cancelled) {
      throw new BadRequestException("AMC is already cancelled");
    }
    const record = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.amcRecord.update({
        where: { id },
        data: {
          status: AmcStatus.cancelled,
          cancelledAt: new Date(),
          cancelledRemark: dto.remark,
          renewalDecision: AmcRenewalDecision.declined,
        },
        include: { project: { include: projectInclude } },
      });
      const stillRunning = await tx.amcRecord.findFirst({
        where: this.runningWhere(before.projectId),
      });
      if (!stillRunning) {
        await tx.project.update({
          where: { id: before.projectId },
          data: { status: ProjectStatus.closed },
        });
      }
      return updated;
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_CANCELLED,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: {
        before: this.serialize(before),
        after: this.serializeWithProject(record),
      },
    });
    return this.serializeWithProject(record);
  }

  async cancelByProject(
    projectId: string,
    dto: CancelAmcDto,
    actorId: string,
  ) {
    const running = await this.findRunningAmc(projectId);
    if (!running) {
      throw new NotFoundException(`Running AMC for project ${projectId} not found`);
    }
    return this.cancel(running.id, dto, actorId);
  }

  async setRenewalDecision(
    id: string,
    dto: RenewalDecisionDto,
    actorId: string,
  ) {
    const before = await this.getByIdOrThrow(id);
    if (before.status === AmcStatus.cancelled) {
      throw new BadRequestException("AMC is already cancelled");
    }
    if (
      dto.decision !== AmcRenewalDecision.renewed &&
      dto.decision !== AmcRenewalDecision.declined
    ) {
      throw new BadRequestException("Decision must be renewed or declined");
    }

    if (dto.decision === AmcRenewalDecision.declined) {
      return this.cancel(
        id,
        {
          remark: dto.remark?.trim() || "Client declined renewal",
        },
        actorId,
      );
    }

    const record = await this.prismaService.amcRecord.update({
      where: { id },
      data: { renewalDecision: AmcRenewalDecision.renewed },
      include: { project: { include: projectInclude } },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.AMC_UPDATED,
      targetType: "AmcRecord",
      targetId: record.id,
      metadata: {
        before: this.serialize(before),
        after: this.serializeWithProject(record),
        renewalDecision: dto.decision,
      },
    });
    return this.serializeWithProject(record);
  }

  async findById(id: string) {
    const record = await this.prismaService.amcRecord.findUnique({
      where: { id },
      include: { project: { include: projectInclude } },
    });
    if (!record) {
      throw new NotFoundException(`AMC ${id} not found`);
    }
    return this.serializeWithProject(record);
  }

  async findByProject(projectId: string) {
    const records = await this.prismaService.amcRecord.findMany({
      where: { projectId },
      include: { project: { include: projectInclude } },
      orderBy: { startDate: "desc" },
    });
    return records.map((r) => this.serializeWithProject(r));
  }

  async findCurrentByProject(projectId: string) {
    const running = await this.findRunningAmc(projectId);
    if (!running) {
      throw new NotFoundException(`AMC for project ${projectId} not found`);
    }
    const full = await this.prismaService.amcRecord.findUnique({
      where: { id: running.id },
      include: { project: { include: projectInclude } },
    });
    return this.serializeWithProject(full!);
  }

  /** Recompute AMC status from end date and reminder lead days. */
  deriveStatus(endDate: Date, reminderLeadDays: number): AmcStatus {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setUTCHours(0, 0, 0, 0);
    if (today > end) {
      return AmcStatus.overdue;
    }
    const leadMs = reminderLeadDays * 86_400_000;
    const reminderStart = new Date(end.getTime() - leadMs);
    if (today >= reminderStart) {
      return AmcStatus.reminder_due;
    }
    return AmcStatus.free_period;
  }

  private runningWhere(projectId: string) {
    return {
      projectId,
      status: { not: AmcStatus.cancelled },
      NOT: {
        renewalDecision: {
          in: [AmcRenewalDecision.declined, AmcRenewalDecision.renewed],
        },
      },
    };
  }

  private async findRunningAmc(projectId: string) {
    return this.prismaService.amcRecord.findFirst({
      where: this.runningWhere(projectId),
      orderBy: { endDate: "desc" },
    });
  }

  private async getByIdOrThrow(id: string) {
    const record = await this.prismaService.amcRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`AMC ${id} not found`);
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

  private serializeWithProject<
    T extends {
      amcAmountPaisa: bigint | null;
      project?: {
        id: string;
        name: string;
        client?: { id: string; name: string };
      };
    },
  >(record: T) {
    const base = this.serialize(record);
    return {
      ...base,
      projectName: record.project?.name ?? null,
      clientName: record.project?.client?.name ?? null,
      clientId: record.project?.client?.id ?? null,
    };
  }
}
