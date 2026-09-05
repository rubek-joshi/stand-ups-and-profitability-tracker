import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CasbinService } from "../casbin/casbin.service";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { AmcService } from "./amc.service";
import {
  CancelAmcDto,
  CreateAmcDto,
  RenewalDecisionDto,
  SetAmcDto,
  UpdateAmcDto,
} from "./dto/amc.dto";

@ApiTags("amc")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("amc")
export class AmcController {
  constructor(
    private readonly amcService: AmcService,
    private readonly casbinService: CasbinService,
  ) {}

  @Get()
  @RequirePermission("amc", "read")
  @ApiOperation({ summary: "List AMC records" })
  async findAll(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("clientId") clientId?: string,
    @Query("projectId") projectId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.amcService.findAll({
      q,
      status,
      type,
      clientId,
      projectId,
      from,
      to,
      page,
      pageSize,
    });
  }

  @Post()
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Create AMC on a project" })
  async create(@Body() dto: CreateAmcDto, @CurrentUser() user: AuthUser) {
    return this.amcService.create(dto, user.id);
  }

  @Post("projects/:projectId")
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Set AMC on a closed project" })
  async setOnProject(
    @Param("projectId") projectId: string,
    @Body() dto: SetAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.setOnProject(projectId, dto, user.id);
  }

  @Get("projects/:projectId")
  @RequirePermission("amc", "read")
  @ApiOperation({ summary: "List AMCs for a project" })
  async findByProject(@Param("projectId") projectId: string) {
    return this.amcService.findByProject(projectId);
  }

  @Get("projects/:projectId/current")
  @RequirePermission("amc", "read")
  @ApiOperation({ summary: "Get running AMC for a project" })
  async findCurrentByProject(@Param("projectId") projectId: string) {
    return this.amcService.findCurrentByProject(projectId);
  }

  @Patch("projects/:projectId")
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Update running AMC for a project" })
  async updateByProject(
    @Param("projectId") projectId: string,
    @Body() dto: UpdateAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.updateByProject(projectId, dto, user.id);
  }

  @Post("projects/:projectId/cancel")
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Cancel running AMC for a project" })
  async cancelByProject(
    @Param("projectId") projectId: string,
    @Body() dto: CancelAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.cancelByProject(projectId, dto, user.id);
  }

  @Get(":id")
  @RequirePermission("amc", "read")
  @ApiOperation({ summary: "Get AMC by id" })
  async findOne(@Param("id") id: string) {
    return this.amcService.findById(id);
  }

  @Patch(":id")
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Update AMC" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.update(id, dto, user.id);
  }

  @Delete(":id")
  @RequirePermission("amc", "delete")
  @ApiOperation({ summary: "Permanently delete AMC (super admin only)" })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const role = await this.casbinService.getPrimaryRoleForUser(user.id);
    if (role !== "super_admin") {
      throw new ForbiddenException("Only super admins can delete AMC records");
    }
    return this.amcService.remove(id, user.id);
  }

  @Post(":id/cancel")
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Cancel AMC" })
  async cancel(
    @Param("id") id: string,
    @Body() dto: CancelAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.cancel(id, dto, user.id);
  }

  @Post(":id/renewal-decision")
  @RequirePermission("amc", "write")
  @ApiOperation({ summary: "Mark AMC renewal as renewed or declined" })
  async renewalDecision(
    @Param("id") id: string,
    @Body() dto: RenewalDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.setRenewalDecision(id, dto, user.id);
  }
}
