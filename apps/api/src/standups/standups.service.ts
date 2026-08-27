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
  Prisma,
  ProjectStatus,
  StandupTaskState,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import {
  parseIsoDate,
  assignmentCoversDate,
  dayBefore,
  toIsoDate,
  toMonthKey,
} from "../_shared/utils/date.util";
import {
  STANDUP_DELETABLE_DAYS,
  STANDUP_EDITABLE_DAYS,
  isStandupDeletable,
  isStandupEditable,
  nptYesterdayDate,
} from "../_shared/utils/standup-age.util";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";
import { ProfitabilityService } from "../profitability/profitability.service";
import {
  AssignmentResolutionItemDto,
  BatchUpdateStandupEntriesDto,
  CreateStandupDto,
  MissingAssignmentAction,
  StandupHistoryQueryDto,
  UpdateStandupEntryDto,
} from "./dto/standup.dto";

type MissingAssignmentFix = {
  entryId: string;
  employeeId: string;
  employeeName: string;
  projectId: string;
  projectName: string;
  currentAssignedFrom: string | null;
  availableActions: MissingAssignmentAction[];
};

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
    if (employees.length === 0) {
      throw new BadRequestException(
        "No active employees available for the selected date",
      );
    }
    const standup = await this.prismaService.standup.create({
      data: {
        date,
        createdById: actorId,
        updatedById: actorId,
        employeeGroupId: null,
        entries: {
          create: employees.map((employee) => ({
            employeeId: employee.id,
            attendanceStatus: AttendanceStatus.present,
          })),
        },
      },
      include: {
        entries: {
          include: {
            employee: true,
            allocations: { include: { project: true, tasks: true } },
          },
        },
        employeeGroup: { select: { id: true, name: true } },
      },
    });
    await this.carryForwardTasksFromPreviousStandup(standup.id, date);
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_CREATED,
      targetType: "Standup",
      targetId: standup.id,
      metadata: {
        date: dto.date,
        entryCount: employees.length,
      },
    });
    return this.loadStandupOrThrow(standup.id);
  }

  async findAll(filters: { page?: string; pageSize?: string } = {}) {
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [rows, total] = await Promise.all([
      this.prismaService.standup.findMany({
        orderBy: { date: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
          entries: {
            select: {
              attendanceStatus: true,
              allocations: { select: { projectId: true } },
            },
          },
        },
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.standup.count(),
    ]);
    const data = rows.map((standup) => {
      const projectIds = new Set<string>()
      let working = 0
      let absent = 0
      for (const entry of standup.entries) {
        if (entry.attendanceStatus === AttendanceStatus.absent) {
          absent += 1
        } else {
          working += 1
        }
        for (const allocation of entry.allocations) {
          projectIds.add(allocation.projectId)
        }
      }
      return {
        id: standup.id,
        date: toIsoDate(standup.date),
        createdById: standup.createdById,
        updatedById: standup.updatedById,
        employeeGroupId: standup.employeeGroupId,
        createdAt: standup.createdAt,
        updatedAt: standup.updatedAt,
        createdBy: standup.createdBy,
        updatedBy: standup.updatedBy,
        stats: {
          working,
          absent,
          projectCount: projectIds.size,
        },
      }
    })
    return paginatedResult(data, total, pagination)
  }

  async findCalendar(from: string, to: string) {
    const fromDate = parseIsoDate(from);
    const toDate = parseIsoDate(to);
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException("'from' must be on or before 'to'");
    }
    const maxDays = 366;
    const spanDays =
      Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (spanDays > maxDays) {
      throw new BadRequestException(
        `Date range cannot exceed ${maxDays} days`,
      );
    }

    const standups = await this.prismaService.standup.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        date: true,
      },
      orderBy: { date: "asc" },
    });

    return standups.map((standup) => ({
      id: standup.id,
      date: toIsoDate(standup.date),
    }));
  }

  async findHistory(query: StandupHistoryQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 50);
    const q = query.q?.trim() ?? "";
    const employeeIds = this.parseHistoryEmployeeIds(
      query.employeeIds,
      query.employeeId,
    );
    const employeeIdsParam = employeeIds.length > 0 ? employeeIds : null;
    const projectId = query.projectId?.trim() || null;
    const from = query.from?.trim() || null;
    const to = query.to?.trim() || null;
    const fromDate = from ? parseIsoDate(from) : null;
    const toDate = to ? parseIsoDate(to) : null;
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException("`from` must be on or before `to`");
    }

    if (employeeIds.length > 0) {
      const found = await this.prismaService.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true },
      });
      if (found.length !== employeeIds.length) {
        throw new NotFoundException("One or more employees were not found");
      }
    }
    if (projectId) {
      const project = await this.prismaService.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }
    }

    let cursorDate: Date | null = null;
    let cursorId: string | null = null;
    if (query.cursor) {
      const decoded = this.decodeHistoryCursor(query.cursor);
      cursorDate = parseIsoDate(decoded.date);
      cursorId = decoded.id;
    }

    const rows = await this.queryHistoryStandupIds(
      q || null,
      employeeIdsParam,
      projectId,
      fromDate,
      toDate,
      cursorDate,
      cursorId,
      limit + 1,
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    if (pageRows.length === 0) {
      return {
        data: [],
        meta: { nextCursor: null, hasMore: false },
      };
    }

    const pageIds = pageRows.map((row) => row.id);
    const standups = await this.prismaService.standup.findMany({
      where: { id: { in: pageIds } },
      include: {
        entries: {
          where: {
            ...(employeeIdsParam ? { employeeId: { in: employeeIdsParam } } : {}),
            ...(projectId
              ? { allocations: { some: { projectId } } }
              : {}),
          },
          include: {
            employee: { select: { id: true, name: true } },
            allocations: {
              where: projectId ? { projectId } : undefined,
              include: {
                project: { select: { id: true, name: true } },
                tasks: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
          orderBy: { employee: { name: "asc" } },
        },
      },
    });

    const order = new Map(pageIds.map((id, index) => [id, index]));
    standups.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const data = standups.map((standup) => ({
      date: toIsoDate(standup.date),
      standupId: standup.id,
      records: standup.entries.map((entry) => ({
        id: entry.id,
        employee: entry.employee,
        attendanceStatus: entry.attendanceStatus,
        miscellaneousNotes: projectId ? null : entry.miscellaneousNotes,
        allocations: entry.allocations.map((allocation) => ({
          projectId: allocation.projectId,
          projectName: allocation.project.name,
          percentage: allocation.percentage,
          isNonBillable: allocation.isNonBillable,
          tasks: allocation.tasks.map((task) => ({
            id: task.id,
            text: task.text,
            state: task.state,
            blocker: task.blocker,
            sortOrder: task.sortOrder,
          })),
        })),
      })),
    }));

    const last = standups[standups.length - 1];
    const nextCursor =
      hasMore && last
        ? this.encodeHistoryCursor(toIsoDate(last.date), last.id)
        : null;

    return {
      data,
      meta: { nextCursor, hasMore },
    };
  }

  async findByProject(projectId: string, filters: { limit?: number; cursor?: string } = {}) {
    const project = await this.prismaService.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
    let cursorDate: Date | null = null;
    let cursorId: string | null = null;
    if (filters.cursor) {
      const decoded = this.decodeHistoryCursor(filters.cursor);
      cursorDate = parseIsoDate(decoded.date);
      cursorId = decoded.id;
    }

    const rows = await this.queryHistoryStandupIds(
      null,
      null,
      projectId,
      null,
      null,
      cursorDate,
      cursorId,
      limit + 1,
    );
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    if (pageRows.length === 0) {
      return {
        data: [],
        meta: { nextCursor: null, hasMore: false, project },
      };
    }

    const pageIds = pageRows.map((row) => row.id);
    const standups = await this.prismaService.standup.findMany({
      where: { id: { in: pageIds } },
      include: {
        entries: {
          where: { allocations: { some: { projectId } } },
          include: {
            employee: { select: { id: true, name: true } },
            allocations: {
              where: { projectId },
              include: {
                project: { select: { id: true, name: true } },
                tasks: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
          orderBy: { employee: { name: "asc" } },
        },
      },
    });
    const order = new Map(pageIds.map((id, index) => [id, index]));
    standups.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const data = standups.map((standup) => ({
      date: toIsoDate(standup.date),
      standupId: standup.id,
      records: standup.entries.map((entry) => ({
        id: entry.id,
        employee: entry.employee,
        attendanceStatus: entry.attendanceStatus,
        allocations: entry.allocations.map((allocation) => ({
          projectId: allocation.projectId,
          projectName: allocation.project.name,
          percentage: allocation.percentage,
          isNonBillable: allocation.isNonBillable,
          tasks: allocation.tasks.map((task) => ({
            id: task.id,
            text: task.text,
            state: task.state,
            blocker: task.blocker,
            sortOrder: task.sortOrder,
          })),
        })),
      })),
    }));

    const last = standups[standups.length - 1];
    return {
      data,
      meta: {
        nextCursor:
          hasMore && last
            ? this.encodeHistoryCursor(toIsoDate(last.date), last.id)
            : null,
        hasMore,
        project,
      },
    };
  }

  private parseHistoryEmployeeIds(
    employeeIds?: string,
    employeeId?: string,
  ): string[] {
    const fromList = (employeeIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const single = employeeId?.trim();
    const ids = [...fromList];
    if (single && !ids.includes(single)) {
      ids.push(single);
    }
    return [...new Set(ids)];
  }

  private encodeHistoryCursor(date: string, id: string): string {
    return Buffer.from(JSON.stringify({ date, id }), "utf8").toString(
      "base64url",
    );
  }

  private decodeHistoryCursor(cursor: string): { date: string; id: string } {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      ) as { date?: unknown; id?: unknown };
      if (typeof parsed.date !== "string" || typeof parsed.id !== "string") {
        throw new Error("invalid cursor");
      }
      return { date: parsed.date, id: parsed.id };
    } catch {
      throw new BadRequestException("Invalid cursor");
    }
  }

  private queryHistoryStandupIds(
    q: string | null,
    employeeIds: string[] | null,
    projectId: string | null,
    fromDate: Date | null,
    toDate: Date | null,
    cursorDate: Date | null,
    cursorId: string | null,
    limit: number,
  ) {
    const hasFilter = Boolean(q || employeeIds?.length || projectId);
    if (hasFilter) {
      if (cursorDate && cursorId) {
        return this.prismaService.$queryRaw<Array<{ id: string; date: Date }>>`
          SELECT s.id, s.date
          FROM standups s
          WHERE (s.date, s.id) < (${cursorDate}::date, ${cursorId})
          AND (${fromDate}::date IS NULL OR s.date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR s.date <= ${toDate}::date)
          AND EXISTS (
            SELECT 1 FROM standup_entries se
            WHERE se."standupId" = s.id
            AND (
              ${employeeIds}::text[] IS NULL
              OR se."employeeId" = ANY(${employeeIds})
            )
            AND (
              ${projectId}::text IS NULL
              OR EXISTS (
                SELECT 1 FROM project_allocations pa
                WHERE pa."standupEntryId" = se.id AND pa."projectId" = ${projectId}
              )
            )
            AND (
              ${q}::text IS NULL
              OR standup_entry_matches_search(se.search_text, se.search_vector, ${q})
            )
          )
          ORDER BY s.date DESC, s.id DESC
          LIMIT ${limit}
        `;
      }
      return this.prismaService.$queryRaw<Array<{ id: string; date: Date }>>`
        SELECT s.id, s.date
        FROM standups s
        WHERE (${fromDate}::date IS NULL OR s.date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR s.date <= ${toDate}::date)
        AND EXISTS (
          SELECT 1 FROM standup_entries se
          WHERE se."standupId" = s.id
          AND (
            ${employeeIds}::text[] IS NULL
            OR se."employeeId" = ANY(${employeeIds})
          )
          AND (
            ${projectId}::text IS NULL
            OR EXISTS (
              SELECT 1 FROM project_allocations pa
              WHERE pa."standupEntryId" = se.id AND pa."projectId" = ${projectId}
            )
          )
          AND (
            ${q}::text IS NULL
            OR standup_entry_matches_search(se.search_text, se.search_vector, ${q})
          )
        )
        ORDER BY s.date DESC, s.id DESC
        LIMIT ${limit}
      `;
    }

    if (cursorDate && cursorId) {
      return this.prismaService.$queryRaw<Array<{ id: string; date: Date }>>`
        SELECT s.id, s.date
        FROM standups s
        WHERE (s.date, s.id) < (${cursorDate}::date, ${cursorId})
        AND (${fromDate}::date IS NULL OR s.date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR s.date <= ${toDate}::date)
        ORDER BY s.date DESC, s.id DESC
        LIMIT ${limit}
      `;
    }

    return this.prismaService.$queryRaw<Array<{ id: string; date: Date }>>`
      SELECT s.id, s.date
      FROM standups s
      WHERE (${fromDate}::date IS NULL OR s.date >= ${fromDate}::date)
      AND (${toDate}::date IS NULL OR s.date <= ${toDate}::date)
      ORDER BY s.date DESC, s.id DESC
      LIMIT ${limit}
    `;
  }

  async findOne(id: string) {
    const existing = await this.loadStandupOrThrow(id);
    if (isStandupEditable(existing.date)) {
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
    if (!isStandupEditable(standup.date)) {
      throw new BadRequestException(
        `Stand-ups older than ${STANDUP_EDITABLE_DAYS} days cannot be edited`,
      );
    }

    const assignmentFixes = await this.findMissingAllocationAssignments(
      standup,
      dto.entries,
    );
    let entriesToSave = dto.entries;
    if (assignmentFixes.length > 0) {
      if (!dto.assignmentResolutions?.length) {
        throw new BadRequestException({
          message:
            "Some employees are allocated to projects they are not assigned to",
          code: "MISSING_PROJECT_ASSIGNMENTS",
          missingAssignments: assignmentFixes.map((item) => ({
            employeeId: item.employeeId,
            employeeName: item.employeeName,
            projectId: item.projectId,
            projectName: item.projectName,
            standupDate: toIsoDate(standup.date),
            standupEntryId: item.entryId,
            currentAssignedFrom: item.currentAssignedFrom,
            availableActions: item.availableActions,
          })),
        });
      }
      this.validateAssignmentResolutions(
        assignmentFixes,
        dto.assignmentResolutions,
      );
      entriesToSave = this.applyRemoveAllocationsToEntries(
        dto.entries,
        dto.assignmentResolutions,
        assignmentFixes,
      );
    }

    const entryById = new Map(standup.entries.map((item) => [item.id, item]));
    for (const item of entriesToSave) {
      const entry = entryById.get(item.id);
      if (!entry) {
        throw new NotFoundException(`Standup entry ${item.id} not found`);
      }
      const attendanceStatus = item.attendanceStatus ?? entry.attendanceStatus;
      if (attendanceStatus === AttendanceStatus.absent) {
        continue;
      }
      if (item.allocations) {
        this.validateAllocations(attendanceStatus, item.allocations);
      }
    }

    const updatedEntries = await this.prismaService.$transaction(async (tx) => {
      if (dto.assignmentResolutions?.length) {
        for (const resolution of dto.assignmentResolutions) {
          if (resolution.action === "remove_allocation") {
            continue;
          }
          await this.applyAssignmentResolution(tx, standup.date, resolution);
        }
      }
      for (const item of entriesToSave) {
        const entry = entryById.get(item.id)!;
        const attendanceStatus =
          item.attendanceStatus ?? entry.attendanceStatus;
        if (
          attendanceStatus !== AttendanceStatus.absent &&
          item.allocations?.length
        ) {
          await this.validateAllocationProjects(
            entry.employeeId,
            item.allocations.map((a) => a.projectId),
            standup.date,
            tx,
          );
        }
      }
      const results = [];
      for (const item of entriesToSave) {
        const entry = entryById.get(item.id)!;
        const attendanceStatus =
          item.attendanceStatus ?? entry.attendanceStatus;
        const isAbsent = attendanceStatus === AttendanceStatus.absent;

        if (item.allocations !== undefined || isAbsent) {
          await tx.projectAllocation.deleteMany({
            where: { standupEntryId: item.id },
          });
          if (!isAbsent && item.allocations?.length) {
            for (const [index, allocation] of item.allocations.entries()) {
              const tasks = (allocation.tasks ?? [])
                .map((task, taskIndex) => ({
                  text: task.text ?? "",
                  state: task.state ?? StandupTaskState.open,
                  blocker: task.blocker != null && task.blocker.trim().length > 0
                    ? task.blocker.replace(/\s+$/, "")
                    : null,
                  sortOrder: task.sortOrder ?? taskIndex,
                }))
                .filter(
                  (task) =>
                    task.text.trim().length > 0 ||
                    task.blocker !== null ||
                    task.state !== StandupTaskState.open,
                );
              await tx.projectAllocation.create({
                data: {
                  standupEntryId: item.id,
                  projectId: allocation.projectId,
                  percentage: allocation.percentage,
                  isNonBillable: allocation.isNonBillable ?? false,
                  tasks: {
                    create: tasks,
                  },
                },
              });
              void index;
            }
          }
        }

        results.push(
          await tx.standupEntry.update({
            where: { id: item.id },
            data: {
              attendanceStatus: item.attendanceStatus,
              miscellaneousNotes: isAbsent
                ? null
                : item.miscellaneousNotes !== undefined
                  ? item.miscellaneousNotes
                  : undefined,
            },
            include: {
              employee: true,
              allocations: {
                include: {
                  project: true,
                  tasks: { orderBy: { sortOrder: "asc" } },
                },
              },
            },
          }),
        );
      }
      await tx.standup.update({
        where: { id: standupId },
        data: { updatedById: actorId },
      });
      return results;
    });

    await this.rederiveAttendanceForEmployees(
      standupId,
      updatedEntries.map((item) => item.employeeId),
    );
    this.profitabilityService.clearCache();

    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_UPDATED,
      targetType: "Standup",
      targetId: standupId,
      metadata: {
        entryIds: dto.entries.map((item) => item.id),
        count: dto.entries.length,
        assignmentResolutions: dto.assignmentResolutions ?? [],
      },
    });

    return this.findOne(standupId).then((full) => ({
      ...full,
      entries: full.entries,
      updatedEntryIds: updatedEntries.map((item) => item.id),
    }));
  }

  async remove(standupId: string, actorId: string) {
    const standup = await this.loadStandupOrThrow(standupId);
    if (!isStandupDeletable(standup.date)) {
      throw new BadRequestException(
        `Stand-ups older than ${STANDUP_DELETABLE_DAYS} days cannot be deleted`,
      );
    }
    await this.prismaService.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({ where: { standupId } });
      await tx.standup.delete({ where: { id: standupId } });
    });
    this.profitabilityService.clearCache();
    await this.auditService.write({
      actorId,
      action: AuditAction.STANDUP_DELETED,
      targetType: "Standup",
      targetId: standupId,
      metadata: { date: toIsoDate(standup.date) },
    });
    return { id: standupId };
  }

  /**
   * After NPT midnight: mark yesterday's empty present entries as absent,
   * then re-derive attendance for the whole stand-up.
   */
  async autoAbsentUnwrittenYesterday(): Promise<{
    standupId: string | null;
    markedAbsent: number;
  }> {
    const yesterday = nptYesterdayDate();
    const standup = await this.prismaService.standup.findFirst({
      where: { date: yesterday },
      include: {
        entries: {
          include: {
            allocations: { select: { id: true } },
          },
        },
      },
    });
    if (!standup) {
      return { standupId: null, markedAbsent: 0 };
    }

    const emptyIds = standup.entries
      .filter((entry) => this.isEntryUnwritten(entry))
      .map((entry) => entry.id);

    if (emptyIds.length > 0) {
      await this.prismaService.standupEntry.updateMany({
        where: { id: { in: emptyIds } },
        data: {
          attendanceStatus: AttendanceStatus.absent,
          miscellaneousNotes: null,
        },
      });
      await this.prismaService.projectAllocation.deleteMany({
        where: { standupEntryId: { in: emptyIds } },
      });
    }

    const allEmployeeIds = standup.entries.map((entry) => entry.employeeId);
    await this.rederiveAttendanceForEmployees(standup.id, allEmployeeIds);
    this.profitabilityService.clearCache();

    const systemUser = await this.prismaService.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (systemUser) {
      await this.prismaService.standup.update({
        where: { id: standup.id },
        data: { updatedById: systemUser.id },
      });
      await this.auditService.write({
        actorId: systemUser.id,
        action: AuditAction.STANDUP_AUTO_ABSENTED,
        targetType: "Standup",
        targetId: standup.id,
        metadata: {
          date: toIsoDate(yesterday),
          markedAbsent: emptyIds.length,
        },
      });
    }

    return { standupId: standup.id, markedAbsent: emptyIds.length };
  }

  private async loadStandupOrThrow(id: string) {
    const standup = await this.prismaService.standup.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
        employeeGroup: { select: { id: true, name: true } },
        entries: {
          include: {
            employee: {
              include: {
                assignments: {
                  include: {
                    project: { select: { id: true, name: true, status: true } },
                  },
                },
              },
            },
            allocations: {
              include: {
                project: true,
                tasks: { orderBy: { sortOrder: "asc" as const } },
              },
            },
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

  private isEntryUnwritten(entry: {
    attendanceStatus: AttendanceStatus;
    miscellaneousNotes?: string | null;
    allocations: Array<{ id: string }>;
  }): boolean {
    if (entry.attendanceStatus !== AttendanceStatus.present) {
      return false;
    }
    if (entry.allocations.length > 0) {
      return false;
    }
    if (entry.miscellaneousNotes?.trim()) {
      return false;
    }
    return true;
  }

  private async rederiveAttendanceForEmployees(
    standupId: string,
    employeeIds: string[],
  ) {
    if (employeeIds.length === 0) return;
    const standup = await this.prismaService.standup.findUnique({
      where: { id: standupId },
      select: { id: true, date: true },
    });
    if (!standup) {
      throw new NotFoundException(`Standup ${standupId} not found`);
    }
    const settings = await this.prismaService.orgSettings.findFirst();
    if (!settings) {
      throw new BadRequestException("Org settings not found");
    }
    const uniqueEmployeeIds = [...new Set(employeeIds)];
    const entries = await this.prismaService.standupEntry.findMany({
      where: { standupId, employeeId: { in: uniqueEmployeeIds } },
    });
    const month = toMonthKey(standup.date);

    await this.prismaService.$transaction(async (tx) => {
      await tx.attendanceRecord.deleteMany({
        where: { standupId, employeeId: { in: uniqueEmployeeIds } },
      });
      for (const entry of entries) {
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
    });
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
    await this.carryForwardTasksFromPreviousStandup(
      standup.id,
      standup.date,
      missing.map((employee) => employee.id),
    );
  }

  /**
   * Copy `tomorrow` / `progress` tasks from the most recent prior stand-up
   * (not strictly yesterday). Gaps with no stand-up — weekends, public
   * holidays, or any skipped day — are skipped so Monday can pick up Friday
   * unless Sat/Sun (or a holiday) had its own stand-up in between.
   */
  private async carryForwardTasksFromPreviousStandup(
    standupId: string,
    date: Date,
    employeeIds?: string[],
  ) {
    const previous = await this.prismaService.standup.findFirst({
      where: { date: { lt: date } },
      orderBy: { date: "desc" },
      include: {
        entries: {
          where: employeeIds?.length
            ? { employeeId: { in: employeeIds } }
            : undefined,
          include: {
            allocations: {
              include: {
                tasks: {
                  where: {
                    state: {
                      in: [StandupTaskState.tomorrow, StandupTaskState.progress],
                    },
                  },
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
        },
      },
    });
    if (!previous?.entries.length) {
      return;
    }

    const newEntries = await this.prismaService.standupEntry.findMany({
      where: {
        standupId,
        ...(employeeIds?.length
          ? { employeeId: { in: employeeIds } }
          : {}),
      },
      include: { allocations: true },
    });

    for (const entry of newEntries) {
      if (entry.allocations.length > 0) {
        continue;
      }
      const previousEntry = previous.entries.find(
        (item) => item.employeeId === entry.employeeId,
      );
      if (!previousEntry) {
        continue;
      }
      const toCarry = previousEntry.allocations.filter(
        (allocation) => allocation.tasks.length > 0,
      );
      if (!toCarry.length) {
        continue;
      }
      const base = Math.floor(100 / toCarry.length);
      const remainder = 100 - base * toCarry.length;
      for (const [index, allocation] of toCarry.entries()) {
        await this.prismaService.projectAllocation.create({
          data: {
            standupEntryId: entry.id,
            projectId: allocation.projectId,
            percentage: base + (index === 0 ? remainder : 0),
            isNonBillable: allocation.isNonBillable,
            tasks: {
              create: allocation.tasks.map((task, taskIndex) => ({
                text: task.text,
                state:
                  task.state === StandupTaskState.tomorrow
                    ? StandupTaskState.open
                    : StandupTaskState.progress,
                blocker: task.blocker,
                sortOrder: taskIndex,
              })),
            },
          },
        });
      }
    }
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

  private async isEmployeeAssignedToProjectOnDate(
    employeeId: string,
    projectId: string,
    onDate: Date,
    db: Prisma.TransactionClient | PrismaService = this.prismaService,
  ): Promise<boolean> {
    const assignments = await db.projectAssignment.findMany({
      where: { employeeId, projectId },
    });
    return assignments.some((assignment) =>
      assignmentCoversDate(
        assignment.assignedAt,
        assignment.unassignedAt,
        onDate,
      ),
    );
  }

  private async validateAllocationProjects(
    employeeId: string,
    projectIds: string[],
    onDate?: Date,
    db: Prisma.TransactionClient | PrismaService = this.prismaService,
  ): Promise<void> {
    for (const projectId of projectIds) {
      const assigned = await this.isEmployeeAssignedToProjectOnDate(
        employeeId,
        projectId,
        onDate ?? new Date(),
        db,
      );
      if (!assigned) {
        throw new BadRequestException(
          `Employee is not assigned to project ${projectId}`,
        );
      }
      const project = await db.project.findUnique({
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

  private findLaterActiveAssignment(
    assignments: Array<{
      id: string;
      assignedAt: Date;
      unassignedAt: Date | null;
    }>,
    standupDate: Date,
  ): { id: string; assignedAt: Date } | null {
    const standupDay = toIsoDate(standupDate);
    let latest: { id: string; assignedAt: Date } | null = null;
    for (const assignment of assignments) {
      if (assignment.unassignedAt !== null) {
        continue;
      }
      const assignedDay = toIsoDate(assignment.assignedAt);
      if (assignedDay > standupDay) {
        if (!latest || assignment.assignedAt > latest.assignedAt) {
          latest = assignment;
        }
      }
    }
    return latest;
  }

  private validateAssignmentResolutions(
    fixes: MissingAssignmentFix[],
    resolutions: AssignmentResolutionItemDto[],
  ): void {
    for (const fix of fixes) {
      const resolution = resolutions.find(
        (item) =>
          item.employeeId === fix.employeeId &&
          item.projectId === fix.projectId,
      );
      if (!resolution) {
        throw new BadRequestException(
          `Missing resolution for ${fix.employeeName} on ${fix.projectName}`,
        );
      }
      if (!fix.availableActions.includes(resolution.action)) {
        throw new BadRequestException(
          `Invalid action "${resolution.action}" for ${fix.employeeName} on ${fix.projectName}`,
        );
      }
    }
  }

  private applyRemoveAllocationsToEntries(
    entries: BatchUpdateStandupEntriesDto["entries"],
    resolutions: AssignmentResolutionItemDto[],
    fixes: MissingAssignmentFix[],
  ): BatchUpdateStandupEntriesDto["entries"] {
    return entries.map((entry) => {
      const entryFixes = fixes.filter((fix) => fix.entryId === entry.id);
      if (!entryFixes.length || !entry.allocations?.length) {
        return entry;
      }
      const removeProjectIds = new Set(
        resolutions
          .filter((resolution) => resolution.action === "remove_allocation")
          .filter((resolution) =>
            entryFixes.some(
              (fix) =>
                fix.employeeId === resolution.employeeId &&
                fix.projectId === resolution.projectId,
            ),
          )
          .map((resolution) => resolution.projectId),
      );
      if (!removeProjectIds.size) {
        return entry;
      }
      return {
        ...entry,
        allocations: entry.allocations.filter(
          (allocation) => !removeProjectIds.has(allocation.projectId),
        ),
      };
    });
  }

  private async applyAssignmentResolution(
    tx: Prisma.TransactionClient,
    standupDate: Date,
    resolution: AssignmentResolutionItemDto,
  ): Promise<void> {
    const { employeeId, projectId, action } = resolution;
    const alreadyAssigned = await this.isEmployeeAssignedToProjectOnDate(
      employeeId,
      projectId,
      standupDate,
      tx,
    );
    if (alreadyAssigned) {
      return;
    }

    const assignments = await tx.projectAssignment.findMany({
      where: { employeeId, projectId },
    });
    const laterActive = this.findLaterActiveAssignment(assignments, standupDate);

    switch (action) {
      case "backward_extend":
        if (!laterActive) {
          throw new BadRequestException(
            `No later assignment to extend for project ${projectId}`,
          );
        }
        await tx.projectAssignment.update({
          where: { id: laterActive.id },
          data: { assignedAt: standupDate },
        });
        return;
      case "split":
        if (!laterActive) {
          throw new BadRequestException(
            `No later assignment to split for project ${projectId}`,
          );
        }
        const splitEnd = dayBefore(laterActive.assignedAt);
        if (toIsoDate(splitEnd) < toIsoDate(standupDate)) {
          throw new BadRequestException(
            `Cannot split assignment for project ${projectId} on ${toIsoDate(standupDate)}`,
          );
        }
        await tx.projectAssignment.create({
          data: {
            projectId,
            employeeId,
            assignedAt: standupDate,
            unassignedAt: splitEnd,
          },
        });
        return;
      case "create":
        if (laterActive) {
          throw new BadRequestException(
            `Use split or backward_extend for project ${projectId}; a later assignment already exists`,
          );
        }
        await tx.projectAssignment.create({
          data: {
            projectId,
            employeeId,
            assignedAt: standupDate,
          },
        });
        return;
      default:
        throw new BadRequestException(`Unknown assignment action: ${action}`);
    }
  }

  private async findMissingAllocationAssignments(
    standup: Awaited<ReturnType<StandupsService["findOne"]>>,
    updates: BatchUpdateStandupEntriesDto["entries"],
  ) {
    const entryById = new Map(standup.entries.map((entry) => [entry.id, entry]));
    const seen = new Set<string>();
    const missing: MissingAssignmentFix[] = [];

    for (const item of updates) {
      const entry = entryById.get(item.id);
      if (!entry || !item.allocations?.length) {
        continue;
      }
      const attendanceStatus = item.attendanceStatus ?? entry.attendanceStatus;
      if (attendanceStatus === AttendanceStatus.absent) {
        continue;
      }
      for (const allocation of item.allocations) {
        const assigned = await this.isEmployeeAssignedToProjectOnDate(
          entry.employee.id,
          allocation.projectId,
          standup.date,
        );
        if (assigned) {
          continue;
        }
        const project = await this.prismaService.project.findUnique({
          where: { id: allocation.projectId },
          select: { id: true, name: true },
        });
        if (!project) {
          continue;
        }
        const key = `${entry.employee.id}:${project.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const assignments = await this.prismaService.projectAssignment.findMany({
          where: {
            employeeId: entry.employee.id,
            projectId: project.id,
          },
        });
        const laterActive = this.findLaterActiveAssignment(
          assignments,
          standup.date,
        );
        const availableActions: MissingAssignmentAction[] = [
          "remove_allocation",
        ];
        if (laterActive) {
          availableActions.push("backward_extend", "split");
        } else {
          availableActions.push("create");
        }
        missing.push({
          entryId: entry.id,
          employeeId: entry.employee.id,
          employeeName: entry.employee.name,
          projectId: project.id,
          projectName: project.name,
          currentAssignedFrom: laterActive
            ? toIsoDate(laterActive.assignedAt)
            : null,
          availableActions,
        });
      }
    }

    return missing;
  }
}
