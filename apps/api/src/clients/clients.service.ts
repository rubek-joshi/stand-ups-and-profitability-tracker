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
  "contractedRevenuePaisa",
  "realizedRevenuePaisa",
  "revenuePaisa",
  "employeeCostPaisa",
  "coreMemberCostPaisa",
  "totalCostPaisa",
  "profitLossPaisa",
  "contractedProfitLossPaisa",
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
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        additionalInfo: dto.additionalInfo?.trim() || null,
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
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
            { additionalInfo: { contains: q, mode: "insensitive" as const } },
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
        orderBy: { name: "asc" },
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
            amcRecords: { orderBy: { endDate: "desc" } },
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
          amcRecords,
          _count,
          ...projectFields
        } = project;
        const profitability =
          await this.profitabilityService.calculateProjectProfitLoss(project.id);
        const categories =
          projectCategories?.map((row) => row.category) ?? [];
        const currentAmc =
          amcRecords.find(
            (row) =>
              row.status !== "cancelled" &&
              row.renewalDecision !== "declined" &&
              row.renewalDecision !== "renewed",
          ) ?? null;
        return {
          ...serializeMoneyFields(projectFields, ["budgetPaisa"] as const),
          categories,
          categoryIds: categories.map((category) => category.id),
          extensionCount: _count.extensions,
          amcRecord: currentAmc
            ? serializeMoneyFields(currentAmc, AMC_MONEY_FIELDS)
            : null,
          amcRecords: amcRecords.map((row) =>
            serializeMoneyFields(row, AMC_MONEY_FIELDS),
          ),
          profitability: {
            ...serializeMoneyFields(profitability, PROFIT_MONEY_FIELDS),
            projectId: profitability.projectId,
            forecastProfitLossPaisa:
              profitability.forecastProfitLossPaisa === null
                ? null
                : String(profitability.forecastProfitLossPaisa),
            marginPercent: profitability.marginPercent,
            contractedMarginPercent: profitability.contractedMarginPercent,
            isTrendingOverBudget: profitability.isTrendingOverBudget,
          },
          _profitLossPaisa: profitability.profitLossPaisa,
          _contractedProfitLossPaisa: profitability.contractedProfitLossPaisa,
        };
      }),
    );

    const totalProfitLossPaisa = projects.reduce(
      (sum, project) => sum + project._profitLossPaisa,
      0n,
    );
    const totalContractedProfitLossPaisa = projects.reduce(
      (sum, project) => sum + project._contractedProfitLossPaisa,
      0n,
    );
    const serializedProjects = projects.map(
      ({ _profitLossPaisa: _pl, _contractedProfitLossPaisa: _cpl, ...project }) => project,
    );
    const projectIds = client.projects.map((project) => project.id);
    const stats = await this.buildClientStats(
      projectIds,
      totalProfitLossPaisa,
      totalContractedProfitLossPaisa,
    );

    return {
      ...client,
      projects: serializedProjects,
      stats,
    };
  }

  private async buildClientStats(
    projectIds: string[],
    totalProfitLossPaisa: bigint,
    totalContractedProfitLossPaisa: bigint = 0n,
  ) {
    if (projectIds.length === 0) {
      return {
        profitLossPaisa: "0",
        contractedProfitLossPaisa: "0",
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
      contractedProfitLossPaisa: String(totalContractedProfitLossPaisa),
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
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email?.trim() || null }
          : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.additionalInfo !== undefined
          ? { additionalInfo: dto.additionalInfo?.trim() || null }
          : {}),
      },
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
