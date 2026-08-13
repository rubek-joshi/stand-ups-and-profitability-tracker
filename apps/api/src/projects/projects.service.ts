import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditAction,
  ProjectStatus,
} from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { parseIsoDate } from "../_shared/utils/date.util";
import { nprToPaisa } from "../_shared/utils/money.util";
import {
  serializeMoneyFields,
  serializeMoneyList,
} from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { ProfitabilityService } from "../profitability/profitability.service";
import {
  AssignCoreMemberDto,
  AssignEmployeeDto,
  CreateExtensionDto,
  CreateProjectDto,
  UpdateProjectDto,
} from "./dto/project.dto";

const PROJECT_MONEY_FIELDS = ["budgetPaisa"] as const;
const EXTENSION_MONEY_FIELDS = ["amountPaisa"] as const;

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

  async findAll(filters: { clientId?: string; status?: ProjectStatus }) {
    const projects = await this.prismaService.project.findMany({
      where: {
        ...(filters.clientId ? { clientId: filters.clientId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: this.projectInclude,
      orderBy: { createdAt: "desc" },
    });
    return projects.map((project) => this.serializeProject(project));
  }

  async findOne(id: string) {
    const project = await this.getProjectOrThrow(id);
    const profitability =
      await this.profitabilityService.calculateProjectProfitLoss(id);
    return {
      ...this.serializeProject(project),
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
    const project = await this.prismaService.project.update({
      where: { id },
      data: { status: ProjectStatus.closed },
      include: this.projectInclude,
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_CLOSED,
      targetType: "Project",
      targetId: project.id,
      metadata: {
        before: this.serializeProject(before),
        after: this.serializeProject(project),
      },
    });
    return this.serializeProject(project);
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
    await this.getProjectOrThrow(projectId);
    const coreMember = await this.prismaService.coreMember.findUnique({
      where: { id: dto.coreMemberId },
    });
    if (!coreMember) {
      throw new NotFoundException(`Core member ${dto.coreMemberId} not found`);
    }
    const existing = await this.prismaService.coreMemberAssignment.findFirst({
      where: {
        projectId,
        coreMemberId: dto.coreMemberId,
        unassignedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        "Core member is already assigned to this project",
      );
    }
    const assignment = await this.prismaService.coreMemberAssignment.create({
      data: { projectId, coreMemberId: dto.coreMemberId },
      include: { coreMember: true },
    });
    this.profitabilityService.clearCache(projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_ASSIGNED,
      targetType: "CoreMemberAssignment",
      targetId: assignment.id,
      metadata: { projectId, coreMemberId: dto.coreMemberId },
    });
    return assignment;
  }

  async unassignCoreMember(
    projectId: string,
    coreMemberId: string,
    actorId: string,
  ) {
    const assignment = await this.prismaService.coreMemberAssignment.findFirst({
      where: { projectId, coreMemberId, unassignedAt: null },
    });
    if (!assignment) {
      throw new NotFoundException("Active core member assignment not found");
    }
    const updated = await this.prismaService.coreMemberAssignment.update({
      where: { id: assignment.id },
      data: { unassignedAt: new Date() },
    });
    this.profitabilityService.clearCache(projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.CORE_MEMBER_UNASSIGNED,
      targetType: "CoreMemberAssignment",
      targetId: updated.id,
      metadata: { projectId, coreMemberId },
    });
    return updated;
  }

  async addExtension(
    projectId: string,
    dto: CreateExtensionDto,
    actorId: string,
  ) {
    const project = await this.getProjectOrThrow(projectId);
    const amountPaisa = nprToPaisa(dto.amountNpr ?? 0);
    const extension = await this.prismaService.projectExtension.create({
      data: {
        projectId,
        reason: dto.reason,
        amountPaisa,
        isProfit: amountPaisa > 0n,
        isAuto: false,
        createdById: actorId,
      },
    });
    if (
      project.status === ProjectStatus.active ||
      project.status === ProjectStatus.extended
    ) {
      await this.prismaService.project.update({
        where: { id: projectId },
        data: { status: ProjectStatus.extended },
      });
    }
    this.profitabilityService.clearCache(projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.PROJECT_EXTENDED,
      targetType: "ProjectExtension",
      targetId: extension.id,
      metadata: { after: serializeMoneyFields(extension, EXTENSION_MONEY_FIELDS) },
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
    amcRecord: true,
  } as const;

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
      amcRecord?: { amcAmountPaisa: bigint | null } | null;
    },
  >(project: T) {
    const serialized = serializeMoneyFields(project, PROJECT_MONEY_FIELDS) as T & {
      categories?: Array<{ id: string; name: string }>;
      categoryIds?: string[];
      extensions?: ReturnType<typeof serializeMoneyList>;
      amcRecord?: ReturnType<typeof serializeMoneyFields> | null;
    };
    const categories =
      project.projectCategories?.map((row) => row.category) ?? [];
    return {
      ...serialized,
      categories,
      categoryIds: categories.map((category) => category.id),
      extensions: project.extensions
        ? serializeMoneyList(project.extensions, EXTENSION_MONEY_FIELDS)
        : project.extensions,
      amcRecord: project.amcRecord
        ? serializeMoneyFields(project.amcRecord, ["amcAmountPaisa"] as const)
        : project.amcRecord,
    };
  }
}
