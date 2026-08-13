import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import {
  CreateEmployeeDto,
  CreateSalaryEntryDto,
  MarkLeftDto,
  UpdateEmployeeDto,
  UpdateSalaryEntryDto,
} from "./dto/employee.dto";
import { EmployeesService } from "./employees.service";

@ApiTags("employees")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Create employee" })
  async create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("employees", "read")
  @ApiOperation({ summary: "List employees" })
  async findAll() {
    return this.employeesService.findAll();
  }

  @Get(":id")
  @RequirePermission("employees", "read")
  @ApiOperation({ summary: "Get employee with salary and attendance stub" })
  async findOne(@Param("id") id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Update employee" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.update(id, dto, user.id);
  }

  @Post(":id/mark-left")
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Mark employee as left" })
  async markLeft(
    @Param("id") id: string,
    @Body() dto: MarkLeftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.markLeft(id, dto, user.id);
  }

  @Delete(":id")
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Delete employee if no history" })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.employeesService.remove(id, user.id);
  }

  @Post(":id/salary-entries")
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Create salary entry" })
  async createSalaryEntry(
    @Param("id") id: string,
    @Body() dto: CreateSalaryEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.createSalaryEntry(id, dto, user.id);
  }

  @Patch(":id/salary-entries/:entryId")
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Update salary entry" })
  async updateSalaryEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateSalaryEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.updateSalaryEntry(id, entryId, dto, user.id);
  }

  @Delete(":id/salary-entries/:entryId")
  @RequirePermission("employees", "*")
  @ApiOperation({ summary: "Delete salary entry" })
  async deleteSalaryEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.employeesService.deleteSalaryEntry(id, entryId, user.id);
  }
}
