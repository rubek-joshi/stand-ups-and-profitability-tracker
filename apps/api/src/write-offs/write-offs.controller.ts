import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../_shared/decorators/current-user.decorator.js';
import { AuthUser } from '../auth/types/auth-user.type.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RequirePermission } from '../casbin/decorators/require-permission.decorator.js';
import { PoliciesGuard } from '../casbin/guards/policies.guard.js';
import { CreateWriteOffDto } from './dto/write-off.dto.js';
import { WriteOffsService } from './write-offs.service.js';

@ApiTags('write-offs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('write-offs')
export class WriteOffsController {
  constructor(private readonly writeOffsService: WriteOffsService) {}

  @Get()
  @RequirePermission('invoices', 'read')
  @ApiOperation({ summary: 'List write-offs for a project or AMC' })
  async findAll(
    @Query('projectId') projectId?: string,
    @Query('amcId') amcId?: string,
  ) {
    return this.writeOffsService.findAll({ projectId, amcId });
  }

  @Post()
  @RequirePermission('invoices', '*')
  @ApiOperation({ summary: 'Create a write-off / bad debt record' })
  async create(
    @Body() dto: CreateWriteOffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.writeOffsService.create(dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('invoices', '*')
  @ApiOperation({ summary: 'Delete a write-off record' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.writeOffsService.remove(id, user.id);
  }
}
