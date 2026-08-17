import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, ClientStatus } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { serializeMoneyFields } from "../_shared/utils/serialize-money.util";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { ProfitabilityService } from "../profitability/profitability.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";

const AMC_MONEY_FIELDS = ["amcAmountPaisa"] as const;
const PROFIT_MONEY_FIELDS = [
  "budgetPaisa",
  "extensionsPaisa",
  "revenuePaisa",
  "employeeCostPaisa",
  "coreMemberCostPaisa",
  "totalCostPaisa",
  "profitLossPaisa",
] as const;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly profitabilityService: ProfitabilityService,
  ) {}

  async create(dto: CreateClientDto, actorId: string) {
    const client = await this.prismaService.client.create({
      data: {
        name: dto.name,
        contactInfo: dto.contactInfo,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CLIENT_CREATED,
      targetType: "Client",
      targetId: client.id,
      metadata: { after: client },
    });
    return client;
  }

  async findAll(filters: { q?: string; page?: string; pageSize?: string } = {}) {
    const q = filters.q?.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { contactInfo: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const [data, total] = await Promise.all([
      this.prismaService.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { projects: true } } },
        ...(pagination
          ? { skip: pagination.skip, take: pagination.take }
          : {}),
      }),
      this.prismaService.client.count({ where }),
    ]);
    return paginatedResult(data, total, pagination);
  }

  async findOne(id: string) {
    const client = await this.prismaService.client.findUnique({
      where: { id },
      include: {
        projects: {
          include: {
            projectCategories: { include: { category: true } },
            amcRecord: true,
            _count: { select: { extensions: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    const projects = await Promise.all(
      client.projects.map(async (project) => {
        const {
          projectCategories,
          amcRecord,
          _count,
          ...projectFields
        } = project;
        const profitability =
          await this.profitabilityService.calculateProjectProfitLoss(project.id);
        const categories =
          projectCategories?.map((row) => row.category) ?? [];
        return {
          ...serializeMoneyFields(projectFields, ["budgetPaisa"] as const),
          categories,
          categoryIds: categories.map((category) => category.id),
          extensionCount: _count.extensions,
          amcRecord: amcRecord
            ? serializeMoneyFields(amcRecord, AMC_MONEY_FIELDS)
            : null,
          profitability: {
            ...serializeMoneyFields(profitability, PROFIT_MONEY_FIELDS),
            projectId: profitability.projectId,
            forecastProfitLossPaisa:
              profitability.forecastProfitLossPaisa === null
                ? null
                : String(profitability.forecastProfitLossPaisa),
            marginPercent: profitability.marginPercent,
            isTrendingOverBudget: profitability.isTrendingOverBudget,
          },
          _profitLossPaisa: profitability.profitLossPaisa,
        };
      }),
    );

    const totalProfitLossPaisa = projects.reduce(
      (sum, project) => sum + project._profitLossPaisa,
      0n,
    );
    const serializedProjects = projects.map(
      ({ _profitLossPaisa: _, ...project }) => project,
    );
    const projectIds = client.projects.map((project) => project.id);
    const stats = await this.buildClientStats(projectIds, totalProfitLossPaisa);

    return {
      ...client,
      projects: serializedProjects,
      stats,
    };
  }

  private async buildClientStats(
    projectIds: string[],
    totalProfitLossPaisa: bigint,
  ) {
    if (projectIds.length === 0) {
      return {
        profitLossPaisa: "0",
        employeesInvolved: [] as Array<{ id: string; name: string }>,
        coreMembersInvolved: [] as Array<{ id: string; name: string }>,
        standupsMentioned: 0,
      };
    }

    const [employeeAssignments, coreMemberAssignments, allocations] =
      await Promise.all([
        this.prismaService.projectAssignment.findMany({
          where: { projectId: { in: projectIds } },
          distinct: ["employeeId"],
          select: {
            employeeId: true,
            employee: { select: { id: true, name: true } },
          },
        }),
        this.prismaService.coreMemberAssignment.findMany({
          where: { projectId: { in: projectIds } },
          select: {
            coreMemberId: true,
            coreMember: { select: { id: true, name: true } },
          },
        }),
        this.prismaService.projectAllocation.findMany({
          where: { projectId: { in: projectIds } },
          select: { standupEntry: { select: { standupId: true } } },
        }),
      ]);

    const standupIds = new Set(
      allocations.map((row) => row.standupEntry.standupId),
    );

    const employeesById = new Map<string, { id: string; name: string }>();
    for (const row of employeeAssignments) {
      employeesById.set(row.employee.id, row.employee);
    }

    const coreMembersById = new Map<string, { id: string; name: string }>();
    for (const row of coreMemberAssignments) {
      coreMembersById.set(row.coreMember.id, row.coreMember);
    }

    return {
      profitLossPaisa: String(totalProfitLossPaisa),
      employeesInvolved: [...employeesById.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      coreMembersInvolved: [...coreMembersById.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      standupsMentioned: standupIds.size,
    };
  }

  async update(id: string, dto: UpdateClientDto, actorId: string) {
    const before = await this.findOne(id);
    const client = await this.prismaService.client.update({
      where: { id },
      data: dto,
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CLIENT_UPDATED,
      targetType: "Client",
      targetId: client.id,
      metadata: { before, after: client },
    });
    return client;
  }

  async deactivate(id: string, actorId: string) {
    const before = await this.findOne(id);
    const client = await this.prismaService.client.update({
      where: { id },
      data: { status: ClientStatus.inactive },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CLIENT_DEACTIVATED,
      targetType: "Client",
      targetId: client.id,
      metadata: { before, after: client },
    });
    return client;
  }

  async remove(id: string, actorId: string) {
    const client = await this.findOne(id);
    const projectCount = await this.prismaService.project.count({
      where: { clientId: id },
    });
    if (projectCount > 0) {
      throw new BadRequestException(
        "Cannot delete a client that has projects. Deactivate instead.",
      );
    }
    await this.prismaService.client.delete({ where: { id } });
    await this.auditService.write({
      actorId,
      action: AuditAction.CLIENT_DELETED,
      targetType: "Client",
      targetId: id,
      metadata: { before: client },
    });
    return { id };
  }
}
