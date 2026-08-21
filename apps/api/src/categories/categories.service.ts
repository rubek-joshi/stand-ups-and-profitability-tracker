import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { serializeMoneyFields } from "../_shared/utils/serialize-money.util";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

const PROJECT_MONEY_FIELDS = ["budgetPaisa"] as const;

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
      include: { _count: { select: { projectCategories: true } } },
    });
  }

  async findOne(id: string) {
    const category = await this.prismaService.category.findUnique({
      where: { id },
      include: {
        _count: { select: { projectCategories: true } },
        projectCategories: {
          include: {
            project: {
              include: {
                client: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { project: { name: "asc" } },
        },
      },
    });
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    const { projectCategories, ...fields } = category;
    return {
      ...fields,
      projects: projectCategories.map(({ project }) =>
        serializeMoneyFields(project, PROJECT_MONEY_FIELDS),
      ),
    };
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

  async remove(id: string, actorId: string) {
    const before = await this.getOrThrow(id);
    if (before.isSeeded) {
      throw new BadRequestException("Seeded categories cannot be deleted");
    }
    const projectCount = await this.prismaService.projectCategory.count({
      where: { categoryId: id },
    });
    if (projectCount > 0) {
      throw new BadRequestException(
        "Cannot delete a category that has projects. Deactivate instead.",
      );
    }
    await this.prismaService.category.delete({ where: { id } });
    await this.auditService.write({
      actorId,
      action: AuditAction.CATEGORY_DELETED,
      targetType: "Category",
      targetId: id,
      metadata: { before },
    });
    return { id };
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
