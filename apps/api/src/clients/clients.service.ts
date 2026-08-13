import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, ClientStatus } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { serializeMoneyFields } from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
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

  async findAll() {
    return this.prismaService.client.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { projects: true } } },
    });
  }

  async findOne(id: string) {
    const client = await this.prismaService.client.findUnique({
      where: { id },
      include: {
        projects: {
          include: {
            projectCategories: { include: { category: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return {
      ...client,
      projects: client.projects.map((project) => ({
        ...serializeMoneyFields(project, ["budgetPaisa"] as const),
        categories:
          project.projectCategories?.map((row) => row.category) ?? [],
        categoryIds:
          project.projectCategories?.map((row) => row.categoryId) ?? [],
      })),
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
