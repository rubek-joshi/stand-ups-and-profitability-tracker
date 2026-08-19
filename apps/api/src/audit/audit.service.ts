import { Injectable } from "@nestjs/common";
import { AuditAction, Prisma } from "@workspace/database";
import {
  paginatedResult,
  resolvePagination,
} from "../_shared/utils/pagination.util";
import { PrismaService } from "../prisma/prisma.service";

export type WriteAuditInput = {
  actorId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata?: unknown;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(
    JSON.stringify(value, (_key, current) =>
      typeof current === "bigint" ? current.toString() : current,
    ),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prismaService: PrismaService) {}

  async write(input: WriteAuditInput): Promise<void> {
    await this.prismaService.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: toJsonValue(input.metadata),
      },
    });
  }

  async findAll(params: {
    action?: AuditAction;
    actorId?: string;
    relatedUserId?: string;
    page?: string;
    pageSize?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.action ? { action: params.action } : {}),
    };
    if (params.relatedUserId) {
      where.OR = [
        { actorId: params.relatedUserId },
        { targetType: "User", targetId: params.relatedUserId },
      ];
    } else if (params.actorId) {
      where.actorId = params.actorId;
    }
    const pagination =
      resolvePagination({
        page: params.page,
        pageSize: params.pageSize,
      }) ??
      (params.take !== undefined
        ? {
            page: Math.floor((params.skip ?? 0) / (params.take || 50)) + 1,
            pageSize: params.take || 50,
            skip: params.skip ?? 0,
            take: params.take || 50,
          }
        : {
            page: 1,
            pageSize: 25,
            skip: 0,
            take: 25,
          });
    const [data, total] = await Promise.all([
      this.prismaService.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prismaService.auditLog.count({ where }),
    ]);
    return paginatedResult(data, total, pagination);
  }

  async listActors() {
    return this.prismaService.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }
}
