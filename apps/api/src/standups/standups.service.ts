import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AmcRenewalDecision,
  AmcStatus,
  AttendanceStatus,
  AttendanceType,
  AuditAction,
  PersonStatus,
  ProjectStatus,
  StandupStatus,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import {
  parseIsoDate,
  toIsoDate,
  toMonthKey,
} from "../_shared/utils/date.util";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";
import { ProfitabilityService } from "../profitability/profitability.service";
import {
  BatchUpdateStandupEntriesDto,
  CreateStandupDto,
  UpdateStandupEntryDto,
} from "./dto/standup.dto";

@Injectable()
export class StandupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly profitabilityService: ProfitabilityService,
  ) {}

  async create(dto: CreateStandupDto, actorId: string) {
    const date = parseIsoDate(dto.date);
    const today = parseIsoDate(toIsoDate(new Date()));
    if (date.getTime() > today.getTime()) {
      throw new BadRequestException(
        "Cannot create a stand-up for a future date",
      );
    }

    const existing = await this.prismaService.standup.findFirst({
      where: { date },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `A stand-up already exists for ${dto.date}`,
      );
    }

    const employees = await this.findActiveEmployeesForDate(date);
    const standup = await this.prismaService.standup.create({
      data: {
        date,
        status: StandupStatus.draft,
        createdById: actorId,
        entries: {
          create: employees.map((employee) => ({
            employeeId: employee.id,
            attendanceStatus: AttendanceStatus.present,
          })),
        },
      },
      include: {
        entries: { include: { employee: true, allocations: true } },
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_CREATED,
      targetType: "Standup",
      targetId: standup.id,
      metadata: { date: dto.date, entryCount: employees.length },
    });
    return standup;
  }

  async findAll(filters: { page?: string; pageSize?: string } = {}) {
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [data, total] = await Promise.all([
      this.prismaService.standup.findMany({
        orderBy: { date: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { entries: true } },
        },
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.standup.count(),
    ]);
    return paginatedResult(data, total, pagination);
  }

  async findOne(id: string) {
    const existing = await this.loadStandupOrThrow(id);
    if (existing.status !== StandupStatus.completed) {
      await this.syncMissingParticipants(existing);
    }
    return this.loadStandupOrThrow(id);
  }

  async updateEntry(
    standupId: string,
    entryId: string,
    dto: UpdateStandupEntryDto,
    actorId: string,
  ) {
    const result = await this.updateEntries(
      standupId,
      { entries: [{ id: entryId, ...dto }] },
      actorId,
    );
    const updated = result.entries.find((item) => item.id === entryId);
    if (!updated) {
      throw new NotFoundException(`Standup entry ${entryId} not found`);
    }
    return updated;
  }

  async updateEntries(
    standupId: string,
    dto: BatchUpdateStandupEntriesDto,
    actorId: string,
  ) {
    if (!dto.entries?.length) {
      throw new BadRequestException("At least one entry is required");
    }
    const standup = await this.findOne(standupId);
    if (standup.status === StandupStatus.completed) {
      throw new BadRequestException(
        "Cannot edit entries on a completed standup; reopen first",
      );
    }

    const entryById = new Map(standup.entries.map((item) => [item.id, item]));
    for (const item of dto.entries) {
      const entry = entryById.get(item.id);
      if (!entry) {
        throw new NotFoundException(`Standup entry ${item.id} not found`);
      }
      const attendanceStatus = item.attendanceStatus ?? entry.attendanceStatus;
      if (item.allocations) {
        this.validateAllocations(attendanceStatus, item.allocations);
        await this.validateAllocationProjects(
          entry.employeeId,
          item.allocations.map((a) => a.projectId),
        );
      }
    }

    const updatedEntries = await this.prismaService.$transaction(async (tx) => {
      const results = [];
      for (const item of dto.entries) {
        const entry = entryById.get(item.id)!;
        const attendanceStatus =
          item.attendanceStatus ?? entry.attendanceStatus;
        if (item.allocations) {
          await tx.projectAllocation.deleteMany({
            where: { standupEntryId: item.id },
          });
          if (
            attendanceStatus !== AttendanceStatus.absent &&
            item.allocations.length > 0
          ) {
            await tx.projectAllocation.createMany({
              data: item.allocations.map((allocation) => ({
                standupEntryId: item.id,
                projectId: allocation.projectId,
                percentage: allocation.percentage,
                isNonBillable: allocation.isNonBillable ?? false,
              })),
            });
          }
        }
        results.push(
          await tx.standupEntry.update({
            where: { id: item.id },
            data: {
              attendanceStatus: item.attendanceStatus,
              notesMarkdown: item.notesMarkdown,
            },
            include: {
              employee: true,
              allocations: { include: { project: true } },
            },
          }),
        );
      }
      if (standup.status === StandupStatus.draft) {
        await tx.standup.update({
          where: { id: standupId },
          data: { status: StandupStatus.in_progress },
        });
      }
      return results;
    });

    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_UPDATED,
      targetType: "Standup",
      targetId: standupId,
      metadata: {
        entryIds: dto.entries.map((item) => item.id),
        count: dto.entries.length,
      },
    });

    return this.findOne(standupId).then((full) => ({
      ...full,
      entries: full.entries,
      updatedEntryIds: updatedEntries.map((item) => item.id),
    }));
  }

  async complete(standupId: string, actorId: string) {
    const standup = await this.findOne(standupId);
    if (standup.status === StandupStatus.completed) {
      throw new BadRequestException("Standup is already completed");
    }
    const settings = await this.prismaService.orgSettings.findFirst();
    if (!settings) {
      throw new BadRequestException("Org settings not found");
    }
    const month = toMonthKey(standup.date);
    await this.prismaService.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({ where: { standupId } });
      for (const entry of standup.entries) {
        if (entry.attendanceStatus === AttendanceStatus.present) {
          continue;
        }
        let type: AttendanceType;
        if (entry.attendanceStatus === AttendanceStatus.first_half_leave) {
          type = AttendanceType.first_half_leave;
        } else if (
          entry.attendanceStatus === AttendanceStatus.second_half_leave
        ) {
          type = AttendanceType.second_half_leave;
        } else if (entry.attendanceStatus === AttendanceStatus.late) {
          type = AttendanceType.late;
        } else {
          const paidCount = await tx.attendanceRecord.count({
            where: {
              employeeId: entry.employeeId,
              month,
              type: AttendanceType.paid_absence,
            },
          });
          type =
            paidCount < settings.paidLeaveDaysPerMonth
              ? AttendanceType.paid_absence
              : AttendanceType.unpaid_absence;
        }
        await tx.attendanceRecord.create({
          data: {
            employeeId: entry.employeeId,
            standupId,
            date: standup.date,
            month,
            type,
          },
        });
      }
      await tx.standup.update({
        where: { id: standupId },
        data: { status: StandupStatus.completed },
      });
    });
    this.profitabilityService.clearCache();
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_COMPLETED,
      targetType: "Standup",
      targetId: standupId,
      metadata: { date: standup.date },
    });
    return this.findOne(standupId);
  }

  async reopen(standupId: string, actorId: string) {
    const standup = await this.findOne(standupId);
    if (standup.status !== StandupStatus.completed) {
      throw new BadRequestException("Only completed standups can be reopened");
    }
    await this.prismaService.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({ where: { standupId } });
      await tx.standup.update({
        where: { id: standupId },
        data: { status: StandupStatus.in_progress },
      });
    });
    this.profitabilityService.clearCache();
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_REOPENED,
      targetType: "Standup",
      targetId: standupId,
    });
    return this.findOne(standupId);
  }

  private async loadStandupOrThrow(id: string) {
    const standup = await this.prismaService.standup.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        entries: {
          include: {
            employee: true,
            allocations: { include: { project: true } },
          },
          orderBy: { employee: { name: "asc" } },
        },
      },
    });
    if (!standup) {
      throw new NotFoundException(`Standup ${id} not found`);
    }
    return standup;
  }

  private async findActiveEmployeesForDate(date: Date) {
    return this.prismaService.employee.findMany({
      where: {
        status: PersonStatus.active,
        dateJoined: { lte: date },
      },
      select: { id: true },
      orderBy: { name: "asc" },
    });
  }

  /** Draft/in-progress standups should include employees hired after creation. */
  private async syncMissingParticipants(
    standup: Awaited<ReturnType<StandupsService["loadStandupOrThrow"]>>,
  ) {
    const active = await this.findActiveEmployeesForDate(standup.date);
    const existingIds = new Set(standup.entries.map((entry) => entry.employeeId));
    const missing = active.filter((employee) => !existingIds.has(employee.id));
    if (missing.length === 0) {
      return;
    }
    await this.prismaService.standupEntry.createMany({
      data: missing.map((employee) => ({
        standupId: standup.id,
        employeeId: employee.id,
        attendanceStatus: AttendanceStatus.present,
      })),
      skipDuplicates: true,
    });
  }

  private validateAllocations(
    attendanceStatus: AttendanceStatus,
    allocations: Array<{ percentage: number }>,
  ): void {
    if (attendanceStatus === AttendanceStatus.absent) {
      if (allocations.length > 0) {
        throw new BadRequestException(
          "Absent entries cannot have project allocations",
        );
      }
      return;
    }
    const total = allocations.reduce((sum, item) => sum + item.percentage, 0);
    if (total > 100) {
      throw new BadRequestException(
        `Allocations cannot exceed 100% (got ${total}%)`,
      );
    }
  }

  private async validateAllocationProjects(
    employeeId: string,
    projectIds: string[],
  ): Promise<void> {
    for (const projectId of projectIds) {
      const assignment = await this.prismaService.projectAssignment.findFirst({
        where: { employeeId, projectId, unassignedAt: null },
      });
      if (!assignment) {
        throw new BadRequestException(
          `Employee is not assigned to project ${projectId}`,
        );
      }
      const project = await this.prismaService.project.findUnique({
        where: { id: projectId },
        include: {
          amcRecords: {
            where: {
              status: { not: AmcStatus.cancelled },
              NOT: {
                renewalDecision: {
                  in: [
                    AmcRenewalDecision.declined,
                    AmcRenewalDecision.renewed,
                  ],
                },
              },
            },
            orderBy: { endDate: "desc" },
            take: 1,
          },
        },
      });
      if (!project) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }
      const currentAmc = project.amcRecords[0] ?? null;
      const blocked =
        (project.status === ProjectStatus.closed ||
          project.status === ProjectStatus.under_amc) &&
        currentAmc === null;
      if (blocked) {
        throw new BadRequestException(
          `Project ${project.name} is closed or cancelled and cannot be allocated`,
        );
      }
    }
  }
}
