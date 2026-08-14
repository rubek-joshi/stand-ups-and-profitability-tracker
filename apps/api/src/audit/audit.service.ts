import { Injectable } from "@nestjs/common";
import { AuditAction, Prisma } from "@workspace/database";
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
    skip?: number;
    take?: number;
  }) {
    const where = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prismaService.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: params.skip ?? 0,
        take: params.take ?? 50,
      }),
      this.prismaService.auditLog.count({ where }),
    ]);
    return { data, meta: { total } };
  }

  async listActors() {
    return this.prismaService.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }
}
