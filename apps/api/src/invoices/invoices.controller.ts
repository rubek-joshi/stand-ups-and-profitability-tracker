import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../_shared/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../casbin/decorators/require-permission.decorator';
import { PoliciesGuard } from '../casbin/guards/policies.guard';
import {
  CreateInvoiceDto,
  MarkInvoicePaidDto,
  UpdateInvoiceDto,
} from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

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
  @ApiOperation({ summary: 'Update a pending invoice' })
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
