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
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import {
  AddEmployeeGroupMemberDto,
  AddEmployeeGroupMembersBulkDto,
  CreateEmployeeGroupDto,
  UpdateEmployeeGroupDto,
} from "./dto/employee-group.dto";
import { EmployeeGroupsService } from "./employee-groups.service";

@ApiTags("employee-groups")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("employee-groups")
export class EmployeeGroupsController {
  constructor(private readonly employeeGroupsService: EmployeeGroupsService) {}

  @Post()
  @RequirePermission("employee-groups", "*")
  @ApiOperation({ summary: "Create employee group" })
  async create(
    @Body() dto: CreateEmployeeGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeeGroupsService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("employee-groups", "read")
  @ApiOperation({ summary: "List employee groups" })
  async findAll(
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.employeeGroupsService.findAll({ q, page, pageSize });
  }

  @Get(":id")
  @RequirePermission("employee-groups", "read")
  @ApiOperation({ summary: "Get employee group with members" })
  async findOne(@Param("id") id: string) {
    return this.employeeGroupsService.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("employee-groups", "*")
  @ApiOperation({ summary: "Update employee group" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeeGroupsService.update(id, dto, user.id);
  }

  @Delete(":id")
  @RequirePermission("employee-groups", "*")
  @ApiOperation({ summary: "Delete employee group" })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.employeeGroupsService.remove(id, user.id);
  }

  @Post(":id/members/bulk")
  @RequirePermission("employee-groups", "*")
  @ApiOperation({ summary: "Add multiple employees to group" })
  async addMembersBulk(
    @Param("id") id: string,
    @Body() dto: AddEmployeeGroupMembersBulkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeeGroupsService.addMembersBulk(id, dto, user.id);
  }

  @Post(":id/members")
  @RequirePermission("employee-groups", "*")
  @ApiOperation({ summary: "Add employee to group" })
  async addMember(
    @Param("id") id: string,
    @Body() dto: AddEmployeeGroupMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeeGroupsService.addMember(id, dto, user.id);
  }

  @Delete(":id/members/:employeeId")
  @RequirePermission("employee-groups", "*")
  @ApiOperation({ summary: "Remove employee from group" })
  async removeMember(
    @Param("id") id: string,
    @Param("employeeId") employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeeGroupsService.removeMember(id, employeeId, user.id);
  }
}
