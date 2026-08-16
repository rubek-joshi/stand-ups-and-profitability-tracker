import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
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
  CreateStandupDto,
  GrantOverrideDto,
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
    if (date.getTime() === today.getTime()) {
      throw new BadRequestException(
        "Cannot create a stand-up for today; use a past date",
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
    const standup = await this.findOne(standupId);
    if (standup.status === StandupStatus.completed) {
      throw new BadRequestException(
        "Cannot edit entries on a completed standup; reopen first",
      );
    }
    const entry = standup.entries.find((item) => item.id === entryId);
    if (!entry) {
      throw new NotFoundException(`Standup entry ${entryId} not found`);
    }
    const attendanceStatus = dto.attendanceStatus ?? entry.attendanceStatus;
    if (dto.allocations) {
      this.validateAllocations(attendanceStatus, dto.allocations);
      await this.validateAllocationProjects(
        entry.employeeId,
        standupId,
        dto.allocations.map((a) => a.projectId),
      );
    }
    const updated = await this.prismaService.$transaction(async (tx) => {
      if (dto.allocations) {
        await tx.projectAllocation.deleteMany({
          where: { standupEntryId: entryId },
        });
        if (
          attendanceStatus !== AttendanceStatus.absent &&
          dto.allocations.length > 0
        ) {
          await tx.projectAllocation.createMany({
            data: dto.allocations.map((allocation) => ({
              standupEntryId: entryId,
              projectId: allocation.projectId,
              percentage: allocation.percentage,
              isNonBillable: allocation.isNonBillable ?? false,
            })),
          });
        }
      }
      return tx.standupEntry.update({
        where: { id: entryId },
        data: {
          attendanceStatus: dto.attendanceStatus,
          notesMarkdown: dto.notesMarkdown,
        },
        include: {
          employee: true,
          allocations: { include: { project: true } },
        },
      });
    });
    if (standup.status === StandupStatus.draft) {
      await this.prismaService.standup.update({
        where: { id: standupId },
        data: { status: StandupStatus.in_progress },
      });
    }
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_UPDATED,
      targetType: "StandupEntry",
      targetId: entryId,
      metadata: { standupId, after: updated },
    });
    return updated;
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

  async grantOverride(
    standupId: string,
    dto: GrantOverrideDto,
    actorId: string,
  ) {
    await this.findOne(standupId);
    const project = await this.prismaService.project.findUnique({
      where: { id: dto.projectId },
      include: { amcRecord: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${dto.projectId} not found`);
    }
    const needsOverride =
      (project.status === ProjectStatus.closed ||
        project.status === ProjectStatus.under_amc) &&
      (project.amcRecord === null ||
        project.amcRecord.status === AmcStatus.cancelled);
    if (!needsOverride) {
      throw new BadRequestException(
        "Override is only for closed/cancelled or closed-without-AMC projects",
      );
    }
    const override = await this.prismaService.standupProjectOverride.upsert({
      where: {
        standupId_projectId: {
          standupId,
          projectId: dto.projectId,
        },
      },
      create: {
        standupId,
        projectId: dto.projectId,
        reason: dto.reason,
        approvedById: actorId,
      },
      update: {
        reason: dto.reason,
        approvedById: actorId,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_OVERRIDE_GRANTED,
      targetType: "StandupProjectOverride",
      targetId: override.id,
      metadata: { standupId, projectId: dto.projectId, reason: dto.reason },
    });
    return override;
  }

  private async loadStandupOrThrow(id: string) {
    const standup = await this.prismaService.standup.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        overrides: { include: { project: { select: { id: true, name: true } } } },
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
    if (total !== 100) {
      throw new BadRequestException(
        `Allocations must sum to 100% (got ${total}%)`,
      );
    }
  }

  private async validateAllocationProjects(
    employeeId: string,
    standupId: string,
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
        include: { amcRecord: true },
      });
      if (!project) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }
      const blocked =
        (project.status === ProjectStatus.closed ||
          project.status === ProjectStatus.under_amc) &&
        (project.amcRecord === null ||
          project.amcRecord.status === AmcStatus.cancelled);
      if (blocked) {
        const override =
          await this.prismaService.standupProjectOverride.findUnique({
            where: {
              standupId_projectId: { standupId, projectId },
            },
          });
        if (!override) {
          throw new BadRequestException(
            `Project ${projectId} requires an admin override for this standup`,
          );
        }
      }
    }
  }
}
