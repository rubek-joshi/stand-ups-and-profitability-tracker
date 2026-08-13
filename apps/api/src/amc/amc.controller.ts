import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { AmcService } from "./amc.service";
import { CancelAmcDto, SetAmcDto, UpdateAmcDto } from "./dto/amc.dto";

@ApiTags("amc")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("amc")
export class AmcController {
  constructor(private readonly amcService: AmcService) {}

  @Post("projects/:projectId")
  @RequirePermission("amc", "*")
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
  @ApiOperation({ summary: "Get AMC for project" })
  async findByProject(@Param("projectId") projectId: string) {
    return this.amcService.findByProject(projectId);
  }

  @Patch("projects/:projectId")
  @RequirePermission("amc", "*")
  @ApiOperation({ summary: "Update AMC status/fields" })
  async update(
    @Param("projectId") projectId: string,
    @Body() dto: UpdateAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.update(projectId, dto, user.id);
  }

  @Post("projects/:projectId/cancel")
  @RequirePermission("amc", "*")
  @ApiOperation({ summary: "Cancel AMC with optional remark" })
  async cancel(
    @Param("projectId") projectId: string,
    @Body() dto: CancelAmcDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.amcService.cancel(projectId, dto, user.id);
  }
}
