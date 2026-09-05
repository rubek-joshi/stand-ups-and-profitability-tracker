import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AmcStatus,
  AmcType,
  AuditAction,
  InvoiceStatus,
  Prisma,
} from '@workspace/database';
import { AuditService } from '../audit/audit.service';
import { ProfitabilityService } from '../profitability/profitability.service';
import { parseIsoDate, toIsoDate } from '../_shared/utils/date.util';
import { nprToPaisa } from '../_shared/utils/money.util';
import {
  paginatedResult,
  resolvePagination,
} from '../_shared/utils/pagination.util';
import { serializeMoneyFields } from '../_shared/utils/serialize-money.util';
import { nptTodayIso } from '../_shared/utils/standup-age.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  MarkInvoicePaidDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto';

const INVOICE_MONEY_FIELDS = ['amountPaisa', 'vatPaisa', 'totalPaisa'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const projectInclude = {
  client: { select: { id: true, name: true } },
} as const;

const amcInclude = {
  select: {
    id: true,
    type: true,
    startDate: true,
    endDate: true,
    amcAmountPaisa: true,
    isVatApplicable: true,
    status: true,
  },
} as const;

const invoiceInclude = {
  project: { include: projectInclude },
  client: { select: { id: true, name: true } },
  amc: amcInclude,
} as const;

type InvoiceParent = {
  projectId: string;
  clientId: string;
  amcId: string | null;
  isVatApplicable: boolean;
  vatRateApplied: number;
};

function requireIsoDate(value: string, label: string): Date {
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
  return parseIsoDate(trimmed);
}

function roundVatPaisa(amountPaisa: bigint, ratePercent: number): bigint {
  if (ratePercent <= 0) return 0n;
  const product = amountPaisa * BigInt(ratePercent);
  return (product + 50n) / 100n;
}

function resolveInvoiceOrder(
  sortBy?: string,
  sortDir?: string,
): Prisma.InvoiceOrderByWithRelationInput[] {
  const dir = sortDir === 'asc' ? 'asc' : 'desc';
  if (sortBy === 'invoiceNumber') {
    return [{ invoiceNumber: dir }, { invoiceDate: 'desc' }];
  }
  if (sortBy === 'invoiceDate') {
    return [{ invoiceDate: dir }, { createdAt: 'desc' }];
  }
  return [{ invoiceDate: 'desc' }, { createdAt: 'desc' }];
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly profitabilityService: ProfitabilityService,
  ) {}

  async findAll(
    filters: {
      q?: string;
      status?: string;
      projectId?: string;
      clientId?: string;
      amcId?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      sortDir?: string;
      page?: string;
      pageSize?: string;
    } = {},
  ) {
    const q = filters.q?.trim();
    const projectId = filters.projectId?.trim();
    const clientId = filters.clientId?.trim();
    const amcId = filters.amcId?.trim();
    const pagination = resolvePagination({
      page: filters.page,
      pageSize: filters.pageSize,
    });

    const status = this.parseStatus(filters.status);
    const from = filters.from
      ? requireIsoDate(filters.from, '`from`')
      : undefined;
    const to = filters.to ? requireIsoDate(filters.to, '`to`') : undefined;
    if (from && to && to.getTime() < from.getTime()) {
      throw new BadRequestException('`to` must be on or after `from`');
    }

    const where: Prisma.InvoiceWhereInput = {
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(amcId ? { amcId } : {}),
      ...(from || to
        ? {
            invoiceDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(q
        ? { invoiceNumber: { contains: q, mode: 'insensitive' as const } }
        : {}),
    };

    const [records, total] = await Promise.all([
      this.prismaService.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: resolveInvoiceOrder(filters.sortBy, filters.sortDir),
        ...(pagination ? { skip: pagination.skip, take: pagination.take } : {}),
      }),
      this.prismaService.invoice.count({ where }),
    ]);

    return paginatedResult(
      records.map((row) => this.serialize(row)),
      total,
      pagination,
    );
  }

  async findById(id: string) {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.serialize(invoice);
  }

  async suggestNextNumber() {
    const rows = await this.prismaService.invoice.findMany({
      where: { invoiceNumber: { startsWith: 'INV-' } },
      select: { invoiceNumber: true },
    });
    let max = 0;
    for (const row of rows) {
      const match = /^INV-(\d+)$/.exec(row.invoiceNumber);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return { nextNumber: `INV-${String(max + 1).padStart(3, '0')}` };
  }

  async create(dto: CreateInvoiceDto, actorId: string) {
    const parent = await this.resolveParent(dto.projectId, dto.amcId);
    const invoiceNumber = dto.invoiceNumber.trim();
    if (!invoiceNumber) {
      throw new BadRequestException('Invoice number is required');
    }

    const invoiceDate = requireIsoDate(dto.invoiceDate, 'Invoice date');
    const amountPaisa = this.parseAmount(dto.amountNpr);
    this.assertInvoiceDateNotFuture(invoiceDate);
    const { vatRateApplied, vatPaisa, totalPaisa } = this.vatFor(
      amountPaisa,
      parent,
    );
    const notes = dto.notes?.trim() || null;

    const duplicate = await this.prismaService.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Invoice number "${invoiceNumber}" is already in use`,
      );
    }

    const created = await this.prismaService.invoice.create({
      data: {
        projectId: parent.projectId,
        clientId: parent.clientId,
        amcId: parent.amcId,
        invoiceNumber,
        invoiceDate,
        amountPaisa,
        vatPaisa,
        totalPaisa,
        vatRateApplied,
        notes,
        createdById: actorId,
      },
      include: invoiceInclude,
    });
    this.profitabilityService.clearCache(parent.projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_CREATED,
      targetType: 'Invoice',
      targetId: created.id,
      metadata: {
        projectId: parent.projectId,
        clientId: parent.clientId,
        amcId: parent.amcId,
        invoiceNumber,
        amountPaisa: amountPaisa.toString(),
        vatPaisa: vatPaisa.toString(),
        totalPaisa: totalPaisa.toString(),
      },
    });
    return this.serialize(created);
  }

  async update(id: string, dto: UpdateInvoiceDto, actorId: string) {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.paid) {
      throw new BadRequestException('Paid invoices cannot be edited');
    }

    const parent = await this.resolveParent(dto.projectId, dto.amcId);
    const invoiceNumber = dto.invoiceNumber.trim();
    if (!invoiceNumber) {
      throw new BadRequestException('Invoice number is required');
    }

    const invoiceDate = requireIsoDate(dto.invoiceDate, 'Invoice date');
    this.assertInvoiceDateNotFuture(invoiceDate);
    const amountPaisa = this.parseAmount(dto.amountNpr);

    const duplicate = await this.prismaService.invoice.findFirst({
      where: { invoiceNumber, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Invoice number "${invoiceNumber}" is already in use`,
      );
    }

    const { vatRateApplied, vatPaisa, totalPaisa } = this.vatFor(
      amountPaisa,
      parent,
    );
    const notes = dto.notes?.trim() || null;

    const updated = await this.prismaService.invoice.update({
      where: { id },
      data: {
        projectId: parent.projectId,
        clientId: parent.clientId,
        amcId: parent.amcId,
        invoiceNumber,
        invoiceDate,
        amountPaisa,
        vatPaisa,
        totalPaisa,
        vatRateApplied,
        notes,
      },
      include: invoiceInclude,
    });
    this.profitabilityService.clearCache(parent.projectId);
    if (invoice.projectId !== parent.projectId) {
      this.profitabilityService.clearCache(invoice.projectId);
    }
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_UPDATED,
      targetType: 'Invoice',
      targetId: updated.id,
      metadata: {
        projectId: parent.projectId,
        clientId: parent.clientId,
        amcId: parent.amcId,
        invoiceNumber,
        amountPaisa: amountPaisa.toString(),
        vatPaisa: vatPaisa.toString(),
        totalPaisa: totalPaisa.toString(),
      },
    });
    return this.serialize(updated);
  }

  async markPaid(id: string, dto: MarkInvoicePaidDto, actorId: string) {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.paid) {
      throw new BadRequestException('Invoice is already marked paid');
    }

    const paymentDate = requireIsoDate(dto.paymentDate, 'Payment date');
    const invoiceDay = toIsoDate(invoice.invoiceDate);
    const paymentDay = toIsoDate(paymentDate);
    const today = nptTodayIso();
    if (paymentDay < invoiceDay) {
      throw new BadRequestException(
        'Payment date cannot be before the invoice date',
      );
    }
    if (paymentDay > today) {
      throw new BadRequestException('Payment date cannot be in the future');
    }

    const updated = await this.prismaService.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.paid, paymentDate },
      include: invoiceInclude,
    });
    this.profitabilityService.clearCache(invoice.projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_MARKED_PAID,
      targetType: 'Invoice',
      targetId: updated.id,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        paymentDate: paymentDay,
      },
    });
    return this.serialize(updated);
  }

  async remove(id: string, actorId: string) {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.prismaService.invoice.delete({ where: { id } });
    this.profitabilityService.clearCache(invoice.projectId);
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_DELETED,
      targetType: 'Invoice',
      targetId: id,
      metadata: {
        projectId: invoice.projectId,
        clientId: invoice.clientId,
        amcId: invoice.amcId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      },
    });
    return { id };
  }

  private async resolveParent(
    projectId?: string,
    amcId?: string,
  ): Promise<InvoiceParent> {
    const trimmedProjectId = projectId?.trim() || undefined;
    const trimmedAmcId = amcId?.trim() || undefined;
    if (Boolean(trimmedProjectId) === Boolean(trimmedAmcId)) {
      throw new BadRequestException(
        'Provide exactly one of projectId or amcId',
      );
    }

    if (trimmedAmcId) {
      const amc = await this.prismaService.amcRecord.findUnique({
        where: { id: trimmedAmcId },
        include: {
          project: {
            select: {
              id: true,
              clientId: true,
              vatRateApplied: true,
            },
          },
        },
      });
      if (!amc) throw new NotFoundException('AMC not found');
      if (amc.type !== AmcType.paid) {
        throw new BadRequestException('Only paid AMCs can be invoiced');
      }
      if (amc.status === AmcStatus.cancelled) {
        throw new BadRequestException('Cancelled AMCs cannot be invoiced');
      }
      return {
        projectId: amc.project.id,
        clientId: amc.project.clientId,
        amcId: amc.id,
        isVatApplicable: amc.isVatApplicable,
        vatRateApplied: amc.project.vatRateApplied,
      };
    }

    const project = await this.prismaService.project.findUnique({
      where: { id: trimmedProjectId! },
      select: {
        id: true,
        clientId: true,
        isVatApplicable: true,
        vatRateApplied: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return {
      projectId: project.id,
      clientId: project.clientId,
      amcId: null,
      isVatApplicable: project.isVatApplicable,
      vatRateApplied: project.vatRateApplied,
    };
  }

  private parseAmount(amountNpr: number): bigint {
    let amountPaisa: bigint;
    try {
      amountPaisa = nprToPaisa(amountNpr);
    } catch {
      throw new BadRequestException('Invalid amount');
    }
    if (amountPaisa <= 0n) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return amountPaisa;
  }

  private assertInvoiceDateNotFuture(invoiceDate: Date) {
    if (toIsoDate(invoiceDate) > nptTodayIso()) {
      throw new BadRequestException('Invoice date cannot be in the future');
    }
  }

  private vatFor(
    amountPaisa: bigint,
    parent: { isVatApplicable: boolean; vatRateApplied: number },
  ) {
    const vatRateApplied = parent.isVatApplicable ? parent.vatRateApplied : 0;
    const vatPaisa = roundVatPaisa(amountPaisa, vatRateApplied);
    return { vatRateApplied, vatPaisa, totalPaisa: amountPaisa + vatPaisa };
  }

  private parseStatus(value?: string): InvoiceStatus | undefined {
    if (!value?.trim()) return undefined;
    if (value === 'unpaid') return InvoiceStatus.pending;
    if (value === InvoiceStatus.pending || value === InvoiceStatus.paid) {
      return value;
    }
    throw new BadRequestException('status must be pending, paid, or unpaid');
  }

  private serialize(
    invoice: Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>,
  ) {
    const withAmcMoney = invoice.amc
      ? {
          ...invoice,
          amc: serializeMoneyFields(invoice.amc, ['amcAmountPaisa'] as const),
        }
      : invoice;
    return serializeMoneyFields(withAmcMoney, INVOICE_MONEY_FIELDS);
  }
}
