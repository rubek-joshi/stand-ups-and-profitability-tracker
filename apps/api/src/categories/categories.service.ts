import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateCategoryDto, actorId: string) {
    const category = await this.prismaService.category.create({
      data: { name: dto.name, isSeeded: false },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CATEGORY_CREATED,
      targetType: "Category",
      targetId: category.id,
      metadata: { after: category },
    });
    return category;
  }

  async findAll() {
    return this.prismaService.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { projects: true } } },
    });
  }

  async update(id: string, dto: UpdateCategoryDto, actorId: string) {
    const before = await this.getOrThrow(id);
    if (before.isSeeded && dto.name && dto.name !== before.name) {
      throw new BadRequestException("Seeded category names cannot be renamed");
    }
    const category = await this.prismaService.category.update({
      where: { id },
      data: dto,
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CATEGORY_UPDATED,
      targetType: "Category",
      targetId: category.id,
      metadata: { before, after: category },
    });
    return category;
  }

  async deactivate(id: string, actorId: string) {
    const before = await this.getOrThrow(id);
    const category = await this.prismaService.category.update({
      where: { id },
      data: { isActive: false },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.CATEGORY_DEACTIVATED,
      targetType: "Category",
      targetId: category.id,
      metadata: { before, after: category },
    });
    return category;
  }

  private async getOrThrow(id: string) {
    const category = await this.prismaService.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    return category;
  }
}
