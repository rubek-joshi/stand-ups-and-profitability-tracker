import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  AmcRenewalDecision,
  AmcStatus,
  PersonStatus,
  Prisma,
  ProjectStatus,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import {
  assignmentPeriodsOverlap,
  parseIsoDate,
  toIsoDate,
} from "../_shared/utils/date.util";
import { nptTodayIso } from "../_shared/utils/standup-age.util";
import { nprToPaisa } from "../_shared/utils/money.util";
import {
  serializeMoneyFields,
  serializeMoneyList,
} from "../_shared/utils/serialize-money.util";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";
import { ProfitabilityService } from "../profitability/profitability.service";
import {
  AssignCoreMemberDto,
  AssignCoreMembersBulkDto,
  AssignEmployeeDto,
  AssignEmployeesBulkDto,
  CreateExtensionDto,
  CreateProjectDto,
  DEFAULT_PROJECT_THEME_COLOR,
  UnassignCoreMemberDto,
  UpdateProjectDto,
} from "./dto/project.dto";

type CoreAssignmentPeriod = {
  assignedAt: Date;
  unassignedAt: Date | null;
};

const PROJECT_MONEY_FIELDS = ["budgetPaisa"] as const;
const EXTENSION_MONEY_FIELDS = ["amountPaisa"] as const;

const PROJECT_SORT_FIELDS = {
  budget: "budgetPaisa",
  startDate: "startDate",
} as const;

type ProjectSortBy = keyof typeof PROJECT_SORT_FIELDS;
type SortDir = "asc" | "desc";

function resolveProjectOrder(
  sortBy?: string,
  sortDir?: string,
): Prisma.ProjectOrderByWithRelationInput[] {
  const field = PROJECT_SORT_FIELDS[sortBy as ProjectSortBy];
  if (!field) {
    return [{ createdAt: "desc" }];
  }
  const dir: SortDir = sortDir === "asc" ? "asc" : "desc";
  return [{ [field]: dir }, { createdAt: "desc" }];
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly profitabilityService: ProfitabilityService,
  ) {}

  async create(dto: CreateProjectDto, actorId: string) {
    const settings = await this.prismaService.orgSettings.findFirst();
    if (!settings) {
      throw new BadRequestException("Org settings not found");
    }
    await this.ensureClientAndCategories(dto.clientId, dto.categoryIds);
    const isVatApplicable = dto.isVatApplicable ?? true;
    const project = await this.prismaService.project.create({
      data: {
        clientId: dto.clientId,
        name: dto.name,
        themeColor: dto.themeColor ?? DEFAULT_PROJECT_THEME_COLOR,
        budgetPaisa: nprToPaisa(dto.budgetNpr),
        startDate: parseIsoDate(dto.startDate),
        endDate: parseIsoDate(dto.endDate),
        isVatApplicable,
        vatRateApplied: isVatApplicable ? settings.vatRatePercent : 0,
        projectCategories: {
          create: [...new Set(dto.categoryIds)].map((categoryId) => ({
            categoryId,
          })),
        },
      },
      include: this.projectInclude,
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_CREATED,
      targetType: "Project",
      targetId: project.id,
      metadata: { after: this.serializeProject(project) },
    });
    return this.serializeProject(project);
  }

  async findAll(filters: {
    clientId?: string;
    status?: ProjectStatus;
    q?: string;
    page?: string;
    pageSize?: string;
    sortBy?: string;
    sortDir?: string;
  }) {
    const q = filters.q?.trim();
    const where = {
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              {
                client: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [projects, total] = await Promise.all([
      this.prismaService.project.findMany({
        where,
        include: this.projectInclude,
        orderBy: resolveProjectOrder(filters.sortBy, filters.sortDir),
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.project.count({ where }),
    ]);
    return paginatedResult(
      projects.map((project) => this.serializeProject(project)),
      total,
      pagination,
    );
  }

  async findOne(id: string) {
    const project = await this.getProjectOrThrow(id);
    const [profitability, laborSummary, allocationCount] = await Promise.all([
      this.profitabilityService.calculateProjectProfitLoss(id),
      this.profitabilityService.calculateProjectLaborSummary(id),
      this.prismaService.projectAllocation.count({ where: { projectId: id } }),
    ]);
    return {
      ...this.serializeProject(project),
      canDelete: this.canDeleteProject(project.status, allocationCount),
      extensions: serializeMoneyList(project.extensions, EXTENSION_MONEY_FIELDS),
      profitability: {
        ...profitability,
        budgetPaisa: String(profitability.budgetPaisa),
        extensionsPaisa: String(profitability.extensionsPaisa),
        revenuePaisa: String(profitability.revenuePaisa),
        employeeCostPaisa: String(profitability.employeeCostPaisa),
        coreMemberCostPaisa: String(profitability.coreMemberCostPaisa),
        totalCostPaisa: String(profitability.totalCostPaisa),
        profitLossPaisa: String(profitability.profitLossPaisa),
        forecastProfitLossPaisa:
          profitability.forecastProfitLossPaisa === null
            ? null
            : String(profitability.forecastProfitLossPaisa),
      },
      dashboard: this.buildDashboard(project, laborSummary),
    };
  }

  async update(id: string, dto: UpdateProjectDto, actorId: string) {
    const before = await this.getProjectOrThrow(id);
    if (dto.categoryIds) {
      await this.ensureCategoriesExist(dto.categoryIds);
    }
    const project = await this.prismaService.$transaction(async (tx) => {
      if (dto.categoryIds) {
        await tx.projectCategory.deleteMany({ where: { projectId: id } });
        await tx.projectCategory.createMany({
          data: [...new Set(dto.categoryIds)].map((categoryId) => ({
            projectId: id,
            categoryId,
          })),
        });
      }
      return tx.project.update({
        where: { id },
        data: {
          name: dto.name,
          themeColor: dto.themeColor,
          budgetPaisa:
            dto.budgetNpr === undefined ? undefined : nprToPaisa(dto.budgetNpr),
          startDate: dto.startDate ? parseIsoDate(dto.startDate) : undefined,
          endDate: dto.endDate ? parseIsoDate(dto.endDate) : undefined,
          isVatApplicable: dto.isVatApplicable,
        },
        include: this.projectInclude,
      });
    });
    this.profitabilityService.clearCache(id);
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_UPDATED,
      targetType: "Project",
      targetId: project.id,
      metadata: {
        before: this.serializeProject(before),
        after: this.serializeProject(project),
      },
    });
    return this.serializeProject(project);
  }

  async close(id: string, actorId: string) {
    const before = await this.getProjectOrThrow(id);
    if (before.status === ProjectStatus.closed || before.status === ProjectStatus.under_amc) {
      throw new BadRequestException("Project is already closed");
    }
    const closedAt = new Date();
    const project = await this.prismaService.$transaction(async (tx) => {
      await tx.projectAssignment.updateMany({
        where: { projectId: id, unassignedAt: null },
        data: { unassignedAt: closedAt },
      });
      await tx.coreMemberAssignment.updateMany({
        where: { projectId: id, unassignedAt: null },
        data: { unassignedAt: closedAt },
      });
      return tx.project.update({
        where: { id },
        data: { status: ProjectStatus.closed },
        include: this.projectInclude,
      });
    });
    this.profitabilityService.clearCache(id);
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_CLOSED,
      targetType: "Project",
      targetId: project.id,
      metadata: {
        before: this.serializeProject(before),
        after: this.serializeProject(project),
        autoReleasedEmployeeIds: before.employeeAssignments
          .filter((assignment) => !assignment.unassignedAt)
          .map((assignment) => assignment.employeeId),
        autoReleasedCoreMemberIds: before.coreMemberAssignments
          .filter((assignment) => !assignment.unassignedAt)
          .map((assignment) => assignment.coreMemberId),
        closedAt,
      },
    });
    return this.serializeProject(project);
  }

  async remove(id: string, actorId: string) {
    const before = await this.getProjectOrThrow(id);
    if (
      before.status === ProjectStatus.closed ||
      before.status === ProjectStatus.under_amc
    ) {
      throw new BadRequestException("Cannot delete a closed project");
    }
    const allocationCount = await this.prismaService.projectAllocation.count({
      where: { projectId: id },
    });
    if (allocationCount > 0) {
      throw new BadRequestException(
        "Cannot delete a project that has stand-up records",
      );
    }
    await this.prismaService.$transaction(async (tx) => {
      await tx.projectAssignment.deleteMany({ where: { projectId: id } });
      await tx.coreMemberAssignment.deleteMany({ where: { projectId: id } });
      await tx.projectExtension.deleteMany({ where: { projectId: id } });
      await tx.project.delete({ where: { id } });
    });
    this.profitabilityService.clearCache(id);
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_DELETED,
      targetType: "Project",
      targetId: id,
      metadata: { before: this.serializeProject(before) },
    });
    return { id };
  }

  async assignEmployee(
    projectId: string,
    dto: AssignEmployeeDto,
    actorId: string,
  ) {
    await this.getProjectOrThrow(projectId);
    const employee = await this.prismaService.employee.findUnique({
      where: { id: dto.employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${dto.employeeId} not found`);
    }
    const existing = await this.prismaService.projectAssignment.findFirst({
      where: {
        projectId,
        employeeId: dto.employeeId,
        unassignedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException("Employee is already assigned to this project");
    }
    const assignment = await this.prismaService.projectAssignment.create({
      data: { projectId, employeeId: dto.employeeId },
      include: { employee: true },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_ASSIGNMENT_CREATED,
      targetType: "ProjectAssignment",
      targetId: assignment.id,
      metadata: { projectId, employeeId: dto.employeeId },
    });
    return assignment;
  }

  async assignEmployeesBulk(
    projectId: string,
    dto: AssignEmployeesBulkDto,
    actorId: string,
  ) {
    await this.getProjectOrThrow(projectId);
    const employeeIds = [...new Set(dto.employeeIds)];
    const employees = await this.prismaService.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, name: true, email: true },
    });
    if (employees.length !== employeeIds.length) {
      const foundIds = new Set(employees.map((employee) => employee.id));
      const missingIds = employeeIds.filter((employeeId) => !foundIds.has(employeeId));
      throw new NotFoundException(`Employees not found: ${missingIds.join(", ")}`);
    }
    const existing = await this.prismaService.projectAssignment.findMany({
      where: {
        projectId,
        employeeId: { in: employeeIds },
        unassignedAt: null,
      },
      include: { employee: true },
    });
    if (existing.length > 0) {
      throw new BadRequestException(
        `Already assigned: ${existing
          .map((assignment) => assignment.employee?.name ?? assignment.employeeId)
          .join(", ")}`,
      );
    }

    const created = await this.prismaService.$transaction(async (tx) => {
      await tx.projectAssignment.createMany({
        data: employeeIds.map((employeeId) => ({ projectId, employeeId })),
      });
      return tx.projectAssignment.findMany({
        where: {
          projectId,
          employeeId: { in: employeeIds },
          unassignedAt: null,
        },
        include: { employee: true },
        orderBy: { assignedAt: "desc" },
      });
    });

    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_ASSIGNMENT_CREATED,
      targetType: "ProjectAssignment",
      targetId: projectId,
      metadata: {
        projectId,
        employeeIds,
        count: created.length,
      },
    });

    return created;
  }

  async unassignEmployee(
    projectId: string,
    employeeId: string,
    actorId: string,
  ) {
    const assignment = await this.prismaService.projectAssignment.findFirst({
      where: { projectId, employeeId, unassignedAt: null },
    });
    if (!assignment) {
      throw new NotFoundException("Active assignment not found");
    }
    const updated = await this.prismaService.projectAssignment.update({
      where: { id: assignment.id },
      data: { unassignedAt: new Date() },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_ASSIGNMENT_ENDED,
      targetType: "ProjectAssignment",
      targetId: updated.id,
      metadata: { projectId, employeeId },
    });
    return updated;
  }

  async assignCoreMember(
    projectId: string,
    dto: AssignCoreMemberDto,
    actorId: string,
  ) {
    const project = await this.getProjectOrThrow(projectId);
    const period = this.resolveCoreMemberPeriod(dto, project.status);
    const coreMember = await this.prismaService.coreMember.findUnique({
      where: { id: dto.coreMemberId },
    });
    if (!coreMember) {
      throw new NotFoundException(`Core member ${dto.coreMemberId} not found`);
    }
    this.assertCoreMemberTenure(coreMember, period);
    const existing = await this.prismaService.coreMemberAssignment.findMany({
      where: { projectId, coreMemberId: dto.coreMemberId },
    });
    this.assertNoCoreAssignmentOverlap(existing, period, coreMember.name);
    const assignment = await this.prismaService.coreMemberAssignment.create({
      data: {
        projectId,
        coreMemberId: dto.coreMemberId,
        assignedAt: period.assignedAt,
        unassignedAt: period.unassignedAt,
      },
      include: { coreMember: true },
    });
    await this.clearCacheForCoreMembers([dto.coreMemberId]);
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_ASSIGNED,
      targetType: "CoreMemberAssignment",
      targetId: assignment.id,
      metadata: {
        projectId,
        coreMemberId: dto.coreMemberId,
        assignedAt: toIsoDate(period.assignedAt),
        unassignedAt: period.unassignedAt
          ? toIsoDate(period.unassignedAt)
          : null,
      },
    });
    return assignment;
  }

  async assignCoreMembersBulk(
    projectId: string,
    dto: AssignCoreMembersBulkDto,
    actorId: string,
  ) {
    const project = await this.getProjectOrThrow(projectId);
    const period = this.resolveCoreMemberPeriod(dto, project.status);
    const coreMemberIds = [...new Set(dto.coreMemberIds)];
    const members = await this.prismaService.coreMember.findMany({
      where: { id: { in: coreMemberIds } },
    });
    if (members.length !== coreMemberIds.length) {
      const foundIds = new Set(members.map((member) => member.id));
      const missingIds = coreMemberIds.filter(
        (coreMemberId) => !foundIds.has(coreMemberId),
      );
      throw new NotFoundException(
        `Core members not found: ${missingIds.join(", ")}`,
      );
    }
    const existing = await this.prismaService.coreMemberAssignment.findMany({
      where: { projectId, coreMemberId: { in: coreMemberIds } },
    });
    const existingByMember = new Map<string, typeof existing>();
    for (const row of existing) {
      const list = existingByMember.get(row.coreMemberId) ?? [];
      list.push(row);
      existingByMember.set(row.coreMemberId, list);
    }
    for (const member of members) {
      this.assertCoreMemberTenure(member, period);
      this.assertNoCoreAssignmentOverlap(
        existingByMember.get(member.id) ?? [],
        period,
        member.name,
      );
    }

    const created = await this.prismaService.$transaction(async (tx) => {
      await tx.coreMemberAssignment.createMany({
        data: coreMemberIds.map((coreMemberId) => ({
          projectId,
          coreMemberId,
          assignedAt: period.assignedAt,
          unassignedAt: period.unassignedAt,
        })),
      });
      return tx.coreMemberAssignment.findMany({
        where: {
          projectId,
          coreMemberId: { in: coreMemberIds },
          assignedAt: period.assignedAt,
          unassignedAt: period.unassignedAt,
        },
        include: { coreMember: true },
        orderBy: { assignedAt: "desc" },
      });
    });

    await this.clearCacheForCoreMembers(coreMemberIds);
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_ASSIGNED,
      targetType: "CoreMemberAssignment",
      targetId: projectId,
      metadata: {
        projectId,
        coreMemberIds,
        count: created.length,
        assignedAt: toIsoDate(period.assignedAt),
        unassignedAt: period.unassignedAt
          ? toIsoDate(period.unassignedAt)
          : null,
      },
    });

    return created;
  }

  async unassignCoreMember(
    projectId: string,
    coreMemberId: string,
    actorId: string,
    dto: UnassignCoreMemberDto = {},
  ) {
    const assignment = await this.prismaService.coreMemberAssignment.findFirst({
      where: { projectId, coreMemberId, unassignedAt: null },
      include: { coreMember: true },
    });
    if (!assignment) {
      throw new NotFoundException("Active core member assignment not found");
    }
    const period: CoreAssignmentPeriod = {
      assignedAt: assignment.assignedAt,
      unassignedAt: dto.unassignedAt
        ? parseIsoDate(dto.unassignedAt)
        : parseIsoDate(nptTodayIso()),
    };
    this.assertAssignmentDates(period);
    this.assertCoreMemberTenure(assignment.coreMember, period);
    const siblings = await this.prismaService.coreMemberAssignment.findMany({
      where: {
        projectId,
        coreMemberId,
        id: { not: assignment.id },
      },
    });
    this.assertNoCoreAssignmentOverlap(
      siblings,
      period,
      assignment.coreMember.name,
    );
    const updated = await this.prismaService.coreMemberAssignment.update({
      where: { id: assignment.id },
      data: { unassignedAt: period.unassignedAt },
    });
    await this.clearCacheForCoreMembers([coreMemberId]);
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_UNASSIGNED,
      targetType: "CoreMemberAssignment",
      targetId: updated.id,
      metadata: {
        projectId,
        coreMemberId,
        assignedAt: toIsoDate(assignment.assignedAt),
        unassignedAt: period.unassignedAt
          ? toIsoDate(period.unassignedAt)
          : null,
      },
    });
    return updated;
  }

  async addExtension(
    projectId: string,
    dto: CreateExtensionDto,
    actorId: string,
  ) {
    const project = await this.getProjectOrThrow(projectId);
    if (
      project.status === ProjectStatus.closed ||
      project.status === ProjectStatus.under_amc
    ) {
      throw new BadRequestException("Cannot extend a closed project");
    }
    const endDate = parseIsoDate(dto.endDate);
    const currentEnd = new Date(project.endDate);
    currentEnd.setUTCHours(0, 0, 0, 0);
    if (endDate <= currentEnd) {
      throw new BadRequestException(
        "Extension end date must be after the project's current end date",
      );
    }
    const amountPaisa = nprToPaisa(dto.amountNpr ?? 0);
    const extension = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.projectExtension.create({
        data: {
          projectId,
          reason: dto.reason,
          amountPaisa,
          isProfit: amountPaisa > 0n,
          isAuto: false,
          endDate,
          createdById: actorId,
        },
      });
      await tx.project.update({
        where: { id: projectId },
        data: {
          endDate,
          status: ProjectStatus.extended,
        },
      });
      return created;
    });
    this.profitabilityService.clearCache(projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_EXTENDED,
      targetType: "ProjectExtension",
      targetId: extension.id,
      metadata: {
        after: serializeMoneyFields(extension, EXTENSION_MONEY_FIELDS),
        previousEndDate: project.endDate,
        newEndDate: endDate,
      },
    });
    return serializeMoneyFields(extension, EXTENSION_MONEY_FIELDS);
  }

  async listAssignments(projectId: string) {
    await this.getProjectOrThrow(projectId);
    const [employees, coreMembers] = await Promise.all([
      this.prismaService.projectAssignment.findMany({
        where: { projectId },
        include: { employee: true },
        orderBy: { assignedAt: "desc" },
      }),
      this.prismaService.coreMemberAssignment.findMany({
        where: { projectId },
        include: { coreMember: true },
        orderBy: { assignedAt: "desc" },
      }),
    ]);
    return { employees, coreMembers };
  }

  private readonly projectInclude = {
    client: true,
    projectCategories: { include: { category: true } },
    extensions: true,
    employeeAssignments: { include: { employee: true } },
    coreMemberAssignments: { include: { coreMember: true } },
    amcRecords: {
      orderBy: { endDate: "desc" as const },
    },
  } as const;

  private canDeleteProject(status: ProjectStatus, allocationCount: number) {
    return (
      status !== ProjectStatus.closed &&
      status !== ProjectStatus.under_amc &&
      allocationCount === 0
    );
  }

  private isClosedProjectStatus(status: ProjectStatus) {
    return (
      status === ProjectStatus.closed || status === ProjectStatus.under_amc
    );
  }

  private resolveCoreMemberPeriod(
    dto: { assignedAt: string; unassignedAt?: string },
    projectStatus: ProjectStatus,
  ): CoreAssignmentPeriod {
    const period: CoreAssignmentPeriod = {
      assignedAt: parseIsoDate(dto.assignedAt),
      unassignedAt: dto.unassignedAt ? parseIsoDate(dto.unassignedAt) : null,
    };
    this.assertAssignmentDates(period);
    if (this.isClosedProjectStatus(projectStatus) && !period.unassignedAt) {
      throw new BadRequestException(
        "Last day assigned is required for closed projects",
      );
    }
    return period;
  }

  private assertAssignmentDates(period: CoreAssignmentPeriod) {
    if (Number.isNaN(period.assignedAt.getTime())) {
      throw new BadRequestException("Invalid assigned from date");
    }
    const today = nptTodayIso();
    const assignedDay = toIsoDate(period.assignedAt);
    if (assignedDay > today) {
      throw new BadRequestException("Assigned from date cannot be in the future");
    }
    if (!period.unassignedAt) {
      return;
    }
    if (Number.isNaN(period.unassignedAt.getTime())) {
      throw new BadRequestException("Invalid last day assigned");
    }
    const lastDay = toIsoDate(period.unassignedAt);
    if (lastDay > today) {
      throw new BadRequestException("Last day assigned cannot be in the future");
    }
    if (lastDay < assignedDay) {
      throw new BadRequestException(
        "Last day assigned must be on or after the assigned-from date",
      );
    }
  }

  private assertCoreMemberTenure(
    member: {
      name: string;
      status: PersonStatus;
      dateJoined: Date;
      dateLeft: Date | null;
    },
    period: CoreAssignmentPeriod,
  ) {
    const assignedDay = toIsoDate(period.assignedAt);
    const joinedDay = toIsoDate(member.dateJoined);
    if (assignedDay < joinedDay) {
      throw new BadRequestException(
        `${member.name} joined on ${joinedDay}; assigned from cannot be earlier`,
      );
    }
    const hasLeft =
      member.status === PersonStatus.left || member.dateLeft !== null;
    if (!hasLeft) {
      return;
    }
    if (!period.unassignedAt) {
      throw new BadRequestException(
        `${member.name} has left; last day assigned is required`,
      );
    }
    if (member.dateLeft) {
      const leftDay = toIsoDate(member.dateLeft);
      if (toIsoDate(period.unassignedAt) > leftDay) {
        throw new BadRequestException(
          `${member.name} left on ${leftDay}; last day assigned cannot be later`,
        );
      }
    }
  }

  private assertNoCoreAssignmentOverlap(
    existing: Array<{ assignedAt: Date; unassignedAt: Date | null }>,
    period: CoreAssignmentPeriod,
    memberName: string,
  ) {
    const overlaps = existing.some((row) =>
      assignmentPeriodsOverlap(
        row.assignedAt,
        row.unassignedAt,
        period.assignedAt,
        period.unassignedAt,
      ),
    );
    if (overlaps) {
      throw new BadRequestException(
        `${memberName} already has an overlapping assignment on this project`,
      );
    }
  }

  private async clearCacheForCoreMembers(coreMemberIds: string[]) {
    if (coreMemberIds.length === 0) {
      return;
    }
    const rows = await this.prismaService.coreMemberAssignment.findMany({
      where: { coreMemberId: { in: coreMemberIds } },
      select: { projectId: true },
      distinct: ["projectId"],
    });
    for (const row of rows) {
      this.profitabilityService.clearCache(row.projectId);
    }
  }

  private async getProjectOrThrow(id: string) {
    const project = await this.prismaService.project.findUnique({
      where: { id },
      include: this.projectInclude,
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  private async ensureClientAndCategories(
    clientId: string,
    categoryIds: string[],
  ) {
    const client = await this.prismaService.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    await this.ensureCategoriesExist(categoryIds);
  }

  private async ensureCategoriesExist(categoryIds: string[]) {
    const uniqueIds = [...new Set(categoryIds)];
    if (uniqueIds.length === 0) {
      throw new BadRequestException("At least one category is required");
    }
    const categories = await this.prismaService.category.findMany({
      where: { id: { in: uniqueIds } },
    });
    if (categories.length !== uniqueIds.length) {
      throw new NotFoundException("One or more categories were not found");
    }
  }

  private serializeProject<
    T extends {
      budgetPaisa: bigint;
      projectCategories?: Array<{ category: { id: string; name: string } }>;
      extensions?: Array<{ amountPaisa: bigint }>;
      amcRecords?: Array<{
        amcAmountPaisa: bigint | null;
        status: AmcStatus;
        renewalDecision: AmcRenewalDecision | null;
        endDate: Date;
      }>;
    },
  >(project: T) {
    const serialized = serializeMoneyFields(project, PROJECT_MONEY_FIELDS) as T & {
      categories?: Array<{ id: string; name: string }>;
      categoryIds?: string[];
      extensions?: ReturnType<typeof serializeMoneyList>;
      amcRecord?: ReturnType<typeof serializeMoneyFields> | null;
      amcRecords?: ReturnType<typeof serializeMoneyFields>[];
    };
    const categories =
      project.projectCategories?.map((row) => row.category) ?? [];
    const amcRecords = (project.amcRecords ?? []).map((row) =>
      serializeMoneyFields(row, ["amcAmountPaisa"] as const),
    );
    const currentAmc =
      (project.amcRecords ?? []).find(
        (row) =>
          row.status !== AmcStatus.cancelled &&
          row.renewalDecision !== AmcRenewalDecision.declined &&
          row.renewalDecision !== AmcRenewalDecision.renewed,
      ) ?? null;
    return {
      ...serialized,
      categories,
      categoryIds: categories.map((category) => category.id),
      extensions: project.extensions
        ? serializeMoneyList(project.extensions, EXTENSION_MONEY_FIELDS)
        : project.extensions,
      amcRecords,
      amcRecord: currentAmc
        ? serializeMoneyFields(currentAmc, ["amcAmountPaisa"] as const)
        : null,
    };
  }

  private buildDashboard(
    project: Awaited<ReturnType<ProjectsService["getProjectOrThrow"]>>,
    laborSummary: Awaited<
      ReturnType<ProfitabilityService["calculateProjectLaborSummary"]>
    >,
  ) {
    const activeEmployeeAssignments = project.employeeAssignments.filter(
      (assignment) => !assignment.unassignedAt,
    );
    const activeCoreMemberAssignments = project.coreMemberAssignments.filter(
      (assignment) => !assignment.unassignedAt,
    );
    return {
      summary: {
        activeEmployeeCount: activeEmployeeAssignments.length,
        activeCoreMemberCount: activeCoreMemberAssignments.length,
        employeeAssignmentCount: project.employeeAssignments.length,
        coreMemberAssignmentCount: project.coreMemberAssignments.length,
        extensionCount: project.extensions.length,
        autoExtensionCount: project.extensions.filter((extension) => extension.isAuto)
          .length,
        completedStandupCount: laborSummary.completedStandupCount,
        standupEmployeeCount: laborSummary.employeeCount,
        allocationPercentTotal: laborSummary.allocationPercentTotal,
        laborCostPaisa: String(laborSummary.totalLaborCostPaisa),
      },
      laborSeries: laborSummary.daily.map((item) => ({
        date: item.date,
        laborCostPaisa: String(item.laborCostPaisa),
        allocationPercentTotal: item.allocationPercentTotal,
        standupCount: item.standupCount,
        employeeCount: item.employeeCount,
      })),
    };
  }
}
