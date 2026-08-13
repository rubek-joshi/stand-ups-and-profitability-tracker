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
  CreateCoreMemberDto,
  CreateCoreMemberSalaryDto,
  MarkCoreMemberLeftDto,
  UpdateCoreMemberDto,
  UpdateCoreMemberSalaryDto,
} from "./dto/core-member.dto";
import { CoreMembersService } from "./core-members.service";

@ApiTags("core-members")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("core-members")
export class CoreMembersController {
  constructor(private readonly coreMembersService: CoreMembersService) {}

  @Post()
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Create core member" })
  async create(
    @Body() dto: CreateCoreMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coreMembersService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("core-members", "read")
  @ApiOperation({ summary: "List core members" })
  async findAll() {
    return this.coreMembersService.findAll();
  }

  @Get(":id")
  @RequirePermission("core-members", "read")
  @ApiOperation({ summary: "Get core member" })
  async findOne(@Param("id") id: string) {
    return this.coreMembersService.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Update core member" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCoreMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coreMembersService.update(id, dto, user.id);
  }

  @Post(":id/mark-left")
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Mark core member as left" })
  async markLeft(
    @Param("id") id: string,
    @Body() dto: MarkCoreMemberLeftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coreMembersService.markLeft(id, dto, user.id);
  }

  @Delete(":id")
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Delete core member if no history" })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.coreMembersService.remove(id, user.id);
  }

  @Post(":id/salary-entries")
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Create salary entry" })
  async createSalaryEntry(
    @Param("id") id: string,
    @Body() dto: CreateCoreMemberSalaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coreMembersService.createSalaryEntry(id, dto, user.id);
  }

  @Patch(":id/salary-entries/:entryId")
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Update salary entry" })
  async updateSalaryEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateCoreMemberSalaryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coreMembersService.updateSalaryEntry(
      id,
      entryId,
      dto,
      user.id,
    );
  }

  @Delete(":id/salary-entries/:entryId")
  @RequirePermission("core-members", "*")
  @ApiOperation({ summary: "Delete salary entry" })
  async deleteSalaryEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.coreMembersService.deleteSalaryEntry(id, entryId, user.id);
  }
}
