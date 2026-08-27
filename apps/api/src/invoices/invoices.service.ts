import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, InvoiceStatus, Prisma } from '@workspace/database';
import { AuditService } from '../audit/audit.service';
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

const projectInclude = {
  client: { select: { id: true, name: true } },
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    filters: {
      q?: string;
      status?: string;
      projectId?: string;
      clientId?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    } = {},
  ) {
    const q = filters.q?.trim();
    const projectId = filters.projectId?.trim();
    const clientId = filters.clientId?.trim();
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
      ...(clientId ? { project: { clientId } } : {}),
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
        include: { project: { include: projectInclude } },
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
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
      include: { project: { include: projectInclude } },
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
    const project = await this.prismaService.project.findUnique({
      where: { id: dto.projectId },
      select: {
        id: true,
        name: true,
        isVatApplicable: true,
        vatRateApplied: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const invoiceNumber = dto.invoiceNumber.trim();
    if (!invoiceNumber) {
      throw new BadRequestException('Invoice number is required');
    }

    const invoiceDate = requireIsoDate(dto.invoiceDate, 'Invoice date');
    let amountPaisa: bigint;
    try {
      amountPaisa = nprToPaisa(dto.amountNpr);
    } catch {
      throw new BadRequestException('Invalid amount');
    }
    if (amountPaisa <= 0n) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    this.assertInvoiceDateNotFuture(invoiceDate);
    const { vatRateApplied, vatPaisa, totalPaisa } = this.vatFor(
      amountPaisa,
      project,
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
        projectId: project.id,
        invoiceNumber,
        invoiceDate,
        amountPaisa,
        vatPaisa,
        totalPaisa,
        vatRateApplied,
        notes,
        createdById: actorId,
      },
      include: { project: { include: projectInclude } },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_CREATED,
      targetType: 'Invoice',
      targetId: created.id,
      metadata: {
        projectId: project.id,
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

    const project = await this.prismaService.project.findUnique({
      where: { id: dto.projectId },
      select: {
        id: true,
        isVatApplicable: true,
        vatRateApplied: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const invoiceNumber = dto.invoiceNumber.trim();
    if (!invoiceNumber) {
      throw new BadRequestException('Invoice number is required');
    }

    const invoiceDate = requireIsoDate(dto.invoiceDate, 'Invoice date');
    this.assertInvoiceDateNotFuture(invoiceDate);

    let amountPaisa: bigint;
    try {
      amountPaisa = nprToPaisa(dto.amountNpr);
    } catch {
      throw new BadRequestException('Invalid amount');
    }
    if (amountPaisa <= 0n) {
      throw new BadRequestException('Amount must be greater than zero');
    }

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
      project,
    );
    const notes = dto.notes?.trim() || null;

    const updated = await this.prismaService.invoice.update({
      where: { id },
      data: {
        projectId: project.id,
        invoiceNumber,
        invoiceDate,
        amountPaisa,
        vatPaisa,
        totalPaisa,
        vatRateApplied,
        notes,
      },
      include: { project: { include: projectInclude } },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_UPDATED,
      targetType: 'Invoice',
      targetId: updated.id,
      metadata: {
        projectId: project.id,
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
      include: { project: { include: projectInclude } },
    });
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
    await this.auditService.write({
      actorId,
      action: AuditAction.INVOICE_DELETED,
      targetType: 'Invoice',
      targetId: id,
      metadata: {
        projectId: invoice.projectId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      },
    });
    return { id };
  }

  private assertInvoiceDateNotFuture(invoiceDate: Date) {
    if (toIsoDate(invoiceDate) > nptTodayIso()) {
      throw new BadRequestException('Invoice date cannot be in the future');
    }
  }

  private vatFor(
    amountPaisa: bigint,
    project: { isVatApplicable: boolean; vatRateApplied: number },
  ) {
    const vatRateApplied = project.isVatApplicable ? project.vatRateApplied : 0;
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
    invoice: Prisma.InvoiceGetPayload<{
      include: { project: { include: typeof projectInclude } };
    }>,
  ) {
    return serializeMoneyFields(invoice, INVOICE_MONEY_FIELDS);
  }
}
