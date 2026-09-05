import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AmcType, AuditAction, Prisma } from '@workspace/database';
import { AuditService } from '../audit/audit.service';
import { ProfitabilityService } from '../profitability/profitability.service';
import { parseIsoDate, toIsoDate } from '../_shared/utils/date.util';
import { nprToPaisa } from '../_shared/utils/money.util';
import { serializeMoneyFields } from '../_shared/utils/serialize-money.util';
import { nptTodayIso } from '../_shared/utils/standup-age.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWriteOffDto } from './dto/write-off.dto';

const WRITE_OFF_MONEY_FIELDS = ['amountPaisa'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const writeOffInclude = {
  project: { select: { id: true, name: true, clientId: true } },
  amc: {
    select: {
      id: true,
      type: true,
      projectId: true,
      amcAmountPaisa: true,
      startDate: true,
      endDate: true,
    },
  },
} as const;

function requireIsoDate(value: string, label: string): Date {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
  return parseIsoDate(trimmed);
}

@Injectable()
export class WriteOffsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly profitabilityService: ProfitabilityService,
  ) {}

  async findAll(filters: { projectId?: string; amcId?: string } = {}) {
    const projectId = filters.projectId?.trim();
    const amcId = filters.amcId?.trim();
    if (!projectId && !amcId) {
      throw new BadRequestException('Provide projectId or amcId');
    }

    const where: Prisma.WriteOffRecordWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(amcId ? { amcId } : {}),
    };

    const rows = await this.prismaService.writeOffRecord.findMany({
      where,
      include: writeOffInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.serialize(row));
  }

  async create(dto: CreateWriteOffDto, actorId: string) {
    const projectId = dto.projectId?.trim() || undefined;
    const amcId = dto.amcId?.trim() || undefined;
    if (Boolean(projectId) === Boolean(amcId)) {
      throw new BadRequestException(
        'Provide exactly one of projectId or amcId',
      );
    }

    const date = requireIsoDate(dto.date, 'Write-off date');
    if (toIsoDate(date) > nptTodayIso()) {
      throw new BadRequestException('Write-off date cannot be in the future');
    }

    let amountPaisa: bigint;
    try {
      amountPaisa = nprToPaisa(dto.amountNpr);
    } catch {
      throw new BadRequestException('Invalid amount');
    }
    if (amountPaisa <= 0n) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    const notes = dto.notes?.trim() || null;
    let cacheProjectId: string;

    if (amcId) {
      const amc = await this.prismaService.amcRecord.findUnique({
        where: { id: amcId },
        select: {
          id: true,
          type: true,
          projectId: true,
          amcAmountPaisa: true,
        },
      });
      if (!amc) throw new NotFoundException('AMC not found');
      if (amc.type !== AmcType.paid) {
        throw new BadRequestException('Only paid AMCs can have write-offs');
      }
      if (amc.amcAmountPaisa == null || amc.amcAmountPaisa <= 0n) {
        throw new BadRequestException('AMC has no contract value to write off');
      }

      const existing = await this.prismaService.writeOffRecord.aggregate({
        where: { amcId },
        _sum: { amountPaisa: true },
      });
      const already = existing._sum.amountPaisa ?? 0n;
      const remaining = amc.amcAmountPaisa - already;
      if (amountPaisa > remaining) {
        throw new BadRequestException(
          `Write-off exceeds remaining AMC value (${remaining} paisa left)`,
        );
      }

      cacheProjectId = amc.projectId;
      const created = await this.prismaService.writeOffRecord.create({
        data: {
          amcId,
          date,
          amountPaisa,
          notes,
          createdById: actorId,
        },
        include: writeOffInclude,
      });
      this.profitabilityService.clearCache(cacheProjectId);
      await this.auditService.write({
        actorId,
        action: AuditAction.WRITE_OFF_CREATED,
        targetType: 'WriteOffRecord',
        targetId: created.id,
        metadata: {
          amcId,
          projectId: cacheProjectId,
          amountPaisa: amountPaisa.toString(),
          date: toIsoDate(date),
        },
      });
      return this.serialize(created);
    }

    const project = await this.prismaService.project.findUnique({
      where: { id: projectId! },
      include: { extensions: { select: { amountPaisa: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');

    const extensionsPaisa = project.extensions.reduce(
      (sum, ext) => sum + ext.amountPaisa,
      0n,
    );
    const contracted = project.budgetPaisa + extensionsPaisa;
    const existing = await this.prismaService.writeOffRecord.aggregate({
      where: { projectId },
      _sum: { amountPaisa: true },
    });
    const already = existing._sum.amountPaisa ?? 0n;
    const remaining = contracted - already;
    if (amountPaisa > remaining) {
      throw new BadRequestException(
        `Write-off exceeds remaining contracted value (${remaining} paisa left)`,
      );
    }

    cacheProjectId = project.id;
    const created = await this.prismaService.writeOffRecord.create({
      data: {
        projectId,
        date,
        amountPaisa,
        notes,
        createdById: actorId,
      },
      include: writeOffInclude,
    });
    this.profitabilityService.clearCache(cacheProjectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.WRITE_OFF_CREATED,
      targetType: 'WriteOffRecord',
      targetId: created.id,
      metadata: {
        projectId,
        amountPaisa: amountPaisa.toString(),
        date: toIsoDate(date),
      },
    });
    return this.serialize(created);
  }

  async remove(id: string, actorId: string) {
    const record = await this.prismaService.writeOffRecord.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Write-off not found');

    await this.prismaService.writeOffRecord.delete({ where: { id } });

    const cacheProjectId =
      record.projectId ??
      (
        await this.prismaService.amcRecord.findUnique({
          where: { id: record.amcId! },
          select: { projectId: true },
        })
      )?.projectId;

    if (cacheProjectId) {
      this.profitabilityService.clearCache(cacheProjectId);
    }

    await this.auditService.write({
      actorId,
      action: AuditAction.WRITE_OFF_DELETED,
      targetType: 'WriteOffRecord',
      targetId: id,
      metadata: {
        projectId: record.projectId,
        amcId: record.amcId,
        amountPaisa: record.amountPaisa.toString(),
        date: toIsoDate(record.date),
      },
    });
    return { id };
  }

  private serialize(
    row: Prisma.WriteOffRecordGetPayload<{ include: typeof writeOffInclude }>,
  ) {
    const withAmcMoney = row.amc
      ? {
          ...row,
          amc: serializeMoneyFields(row.amc, ['amcAmountPaisa'] as const),
        }
      : row;
    return serializeMoneyFields(withAmcMoney, WRITE_OFF_MONEY_FIELDS);
  }
}
