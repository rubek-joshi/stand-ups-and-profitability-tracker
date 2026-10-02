import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../_shared/decorators/current-user.decorator.js';
import { AuthUser } from '../auth/types/auth-user.type.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../casbin/decorators/require-permission.decorator.js';
import { PoliciesGuard } from '../casbin/guards/policies.guard.js';
import {
  CreateInvoiceDto,
  MarkInvoicePaidDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto.js';
import { InvoicesService } from './invoices.service.js';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @RequirePermission('invoices', 'read')
  @ApiOperation({ summary: 'List invoices' })
  async findAll(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('clientId') clientId?: string,
    @Query('amcId') amcId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.invoicesService.findAll({
      q,
      status,
      projectId,
      clientId,
      amcId,
      from,
      to,
      sortBy,
      sortDir,
      page,
      pageSize,
    });
  }

  @Get('export')
  @RequirePermission('invoices', 'read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary:
      'Export all invoices matching filters as CSV (cursor-batched; ignores page/pageSize)',
  })
  async export(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('projectId') projectId?: string,
    @Query('clientId') clientId?: string,
    @Query('amcId') amcId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const { stream, fileName } = await this.invoicesService.exportCsv({
      q,
      status,
      projectId,
      clientId,
      amcId,
      from,
      to,
      sortBy,
      sortDir,
    });
    return new StreamableFile(stream, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get('next-number')
  @RequirePermission('invoices', 'read')
  @ApiOperation({ summary: 'Suggest the next unused INV-NNN number' })
  async nextNumber() {
    return this.invoicesService.suggestNextNumber();
  }

  @Get(':id')
  @RequirePermission('invoices', 'read')
  @ApiOperation({ summary: 'Get invoice by id' })
  async findOne(@Param('id') id: string) {
    return this.invoicesService.findById(id);
  }

  @Post()
  @RequirePermission('invoices', '*')
  @ApiOperation({ summary: 'Create an invoice on a project or paid AMC' })
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoicesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('invoices', '*')
  @ApiOperation({
    summary: 'Update an invoice (including paid; recalculates VAT and P&L cache)',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoicesService.update(id, dto, user.id);
  }

  @Post(':id/mark-paid')
  @RequirePermission('invoices', '*')
  @ApiOperation({ summary: 'Mark an invoice as paid' })
  async markPaid(
    @Param('id') id: string,
    @Body() dto: MarkInvoicePaidDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.invoicesService.markPaid(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('invoices', '*')
  @ApiOperation({ summary: 'Delete an invoice' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.invoicesService.remove(id, user.id);
  }
}
