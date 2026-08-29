import {
  Body,
  Controller,
  createParamDecorator,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProjectStatus } from "@workspace/database";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CasbinService } from "../casbin/casbin.service";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import {
  AssignCoreMemberDto,
  AssignCoreMembersBulkDto,
  AssignEmployeeDto,
  AssignEmployeesBulkDto,
  CreateExtensionDto,
  CreateProjectDto,
  CreateProjectLinkDto,
  CloseProjectDto,
  UnassignCoreMemberDto,
  UnassignEmployeeDto,
  UpdateProjectDto,
  UpdateProjectLinkDto,
} from "./dto/project.dto";
import { ProjectsService } from "./projects.service";
import { StandupsService } from "../standups/standups.service";

const OptionalJsonBody = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ body?: unknown }>();
    return request.body &&
      typeof request.body === "object" &&
      !Array.isArray(request.body)
      ? request.body
      : {};
  },
);

@ApiTags("projects")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly standupsService: StandupsService,
    private readonly casbinService: CasbinService,
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
    @Query("sortBy") sortBy?: string,
    @Query("sortDir") sortDir?: string,
  ) {
    return this.projectsService.findAll({
      clientId,
      status,
      q,
      page,
      pageSize,
      sortBy,
      sortDir,
    });
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
  async close(
    @Param("id") id: string,
    @Body() dto: CloseProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.close(id, dto ?? {}, user.id);
  }

  @Post(":id/reopen")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Re-open a closed project" })
  async reopen(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.reopen(id, user.id);
  }

  @Delete(":id")
  @RequirePermission("projects", "*")
  @ApiOperation({
    summary: "Delete project if it is open and has no stand-up records",
  })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.remove(id, user.id);
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
  @ApiBody({ type: UnassignEmployeeDto, required: false })
  async unassignEmployee(
    @Param("id") id: string,
    @Param("employeeId") employeeId: string,
    @OptionalJsonBody() dto: UnassignEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.unassignEmployee(id, employeeId, user.id, {
      unassignedAt:
        typeof dto?.unassignedAt === "string" ? dto.unassignedAt : undefined,
    });
  }

  @Delete(":id/assignment-logs/employees/:assignmentId")
  @RequirePermission("projects", "*")
  @ApiOperation({
    summary: "Delete ended employee assignment log (super admin only)",
  })
  async deleteEmployeeAssignmentLog(
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertSuperAdmin(user.id);
    return this.projectsService.deleteEmployeeAssignmentLog(
      id,
      assignmentId,
      user.id,
    );
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
  @ApiBody({ type: UnassignCoreMemberDto, required: false })
  async unassignCoreMember(
    @Param("id") id: string,
    @Param("coreMemberId") coreMemberId: string,
    @OptionalJsonBody() dto: UnassignCoreMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.unassignCoreMember(
      id,
      coreMemberId,
      user.id,
      {
        unassignedAt:
          typeof dto?.unassignedAt === "string" ? dto.unassignedAt : undefined,
      },
    );
  }

  @Delete(":id/assignment-logs/core-members/:assignmentId")
  @RequirePermission("projects", "*")
  @ApiOperation({
    summary: "Delete ended core member assignment log (super admin only)",
  })
  async deleteCoreMemberAssignmentLog(
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertSuperAdmin(user.id);
    return this.projectsService.deleteCoreMemberAssignmentLog(
      id,
      assignmentId,
      user.id,
    );
  }

  @Post(":id/links")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Add a project link" })
  async createLink(
    @Param("id") id: string,
    @Body() dto: CreateProjectLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.createLink(id, dto, user.id);
  }

  @Patch(":id/links/:linkId")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Update a project link" })
  async updateLink(
    @Param("id") id: string,
    @Param("linkId") linkId: string,
    @Body() dto: UpdateProjectLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.updateLink(id, linkId, dto, user.id);
  }

  @Delete(":id/links/:linkId")
  @RequirePermission("projects", "*")
  @ApiOperation({ summary: "Delete a project link" })
  async deleteLink(
    @Param("id") id: string,
    @Param("linkId") linkId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.deleteLink(id, linkId, user.id);
  }

  private async assertSuperAdmin(userId: string) {
    const role = await this.casbinService.getPrimaryRoleForUser(userId);
    if (role !== "super_admin") {
      throw new ForbiddenException(
        "Only super admins can delete assignment logs",
      );
    }
  }
}
