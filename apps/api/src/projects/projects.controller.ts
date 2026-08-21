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
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProjectStatus } from "@workspace/database";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import {
  AssignCoreMemberDto,
  AssignCoreMembersBulkDto,
  AssignEmployeeDto,
  AssignEmployeesBulkDto,
  CreateExtensionDto,
  CreateProjectDto,
  UpdateProjectDto,
} from "./dto/project.dto";
import { ProjectsService } from "./projects.service";
import { StandupsService } from "../standups/standups.service";

@ApiTags("projects")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly standupsService: StandupsService,
  ) {}

  @Post()
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Create project" })
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("projects", "read")
  @ApiOperation({ summary: "List projects" })
  async findAll(
    @Query("clientId") clientId?: string,
    @Query("status") status?: ProjectStatus,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.projectsService.findAll({ clientId, status, q, page, pageSize });
  }

  @Get(":id")
  @RequirePermission("projects", "read")
  @ApiOperation({ summary: "Get project with profitability" })
  async findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id);
  }

  @Get(":id/standups")
  @RequirePermission("standups", "read")
  @ApiOperation({
    summary: "Stand-up history for this project (tasks for this project only)",
  })
  async findStandups(
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.standupsService.findByProject(id, {
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch(":id")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Update project" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.update(id, dto, user.id);
  }

  @Post(":id/close")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Close project" })
  async close(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.close(id, user.id);
  }

  @Post(":id/extensions")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Add project extension" })
  async addExtension(
    @Param("id") id: string,
    @Body() dto: CreateExtensionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.addExtension(id, dto, user.id);
  }

  @Get(":id/assignments")
  @RequirePermission("projects", "read")
  @ApiOperation({ summary: "List employee and core member assignments" })
  async listAssignments(@Param("id") id: string) {
    return this.projectsService.listAssignments(id);
  }

  @Post(":id/assignments/employees")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Assign employee" })
  async assignEmployee(
    @Param("id") id: string,
    @Body() dto: AssignEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.assignEmployee(id, dto, user.id);
  }

  @Post(":id/assignments/employees/bulk")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Assign multiple employees" })
  async assignEmployeesBulk(
    @Param("id") id: string,
    @Body() dto: AssignEmployeesBulkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.assignEmployeesBulk(id, dto, user.id);
  }

  @Delete(":id/assignments/employees/:employeeId")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Unassign employee" })
  async unassignEmployee(
    @Param("id") id: string,
    @Param("employeeId") employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.unassignEmployee(id, employeeId, user.id);
  }

  @Post(":id/assignments/core-members")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Assign core member" })
  async assignCoreMember(
    @Param("id") id: string,
    @Body() dto: AssignCoreMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.assignCoreMember(id, dto, user.id);
  }

  @Post(":id/assignments/core-members/bulk")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Assign multiple core members" })
  async assignCoreMembersBulk(
    @Param("id") id: string,
    @Body() dto: AssignCoreMembersBulkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.assignCoreMembersBulk(id, dto, user.id);
  }

  @Delete(":id/assignments/core-members/:coreMemberId")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Unassign core member" })
  async unassignCoreMember(
    @Param("id") id: string,
    @Param("coreMemberId") coreMemberId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.unassignCoreMember(id, coreMemberId, user.id);
  }
}
