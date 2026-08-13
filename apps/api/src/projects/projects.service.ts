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
    await this.ensureClientAndCategory(dto.clientId, dto.categoryId);
    const isVatApplicable = dto.isVatApplicable ?? true;
    const project = await this.prismaService.project.create({
      data: {
        clientId: dto.clientId,
        categoryId: dto.categoryId,
        name: dto.name,
        budgetPaisa: nprToPaisa(dto.budgetNpr),
        startDate: parseIsoDate(dto.startDate),
        endDate: parseIsoDate(dto.endDate),
        isVatApplicable,
        vatRateApplied: isVatApplicable ? settings.vatRatePercent : 0,
      },
      include: { client: true, category: true },
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
      include: { client: true, category: true },
      orderBy: { createdAt: "desc" },
    });
    return serializeMoneyList(projects, PROJECT_MONEY_FIELDS);
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
    if (dto.categoryId) {
      const category = await this.prismaService.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category ${dto.categoryId} not found`);
      }
    }
    const project = await this.prismaService.project.update({
      where: { id },
      data: {
        name: dto.name,
        categoryId: dto.categoryId,
        budgetPaisa:
          dto.budgetNpr === undefined ? undefined : nprToPaisa(dto.budgetNpr),
        startDate: dto.startDate ? parseIsoDate(dto.startDate) : undefined,
        endDate: dto.endDate ? parseIsoDate(dto.endDate) : undefined,
        isVatApplicable: dto.isVatApplicable,
      },
      include: { client: true, category: true, extensions: true },
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
      include: { client: true, category: true, extensions: true },
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

  private async getProjectOrThrow(id: string) {
    const project = await this.prismaService.project.findUnique({
      where: { id },
      include: {
        client: true,
        category: true,
        extensions: true,
        employeeAssignments: { include: { employee: true } },
        coreMemberAssignments: { include: { coreMember: true } },
        amcRecord: true,
      },
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  private async ensureClientAndCategory(clientId: string, categoryId: string) {
    const [client, category] = await Promise.all([
      this.prismaService.client.findUnique({ where: { id: clientId } }),
      this.prismaService.category.findUnique({ where: { id: categoryId } }),
    ]);
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }
    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }
  }

  private serializeProject<T extends { budgetPaisa: bigint }>(project: T) {
    return serializeMoneyFields(project, PROJECT_MONEY_FIELDS);
  }
}
