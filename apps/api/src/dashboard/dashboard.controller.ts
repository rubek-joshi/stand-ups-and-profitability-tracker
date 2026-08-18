import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CasbinService } from "../casbin/casbin.service";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly casbinService: CasbinService,
  ) {}

  @Get("summary")
  @RequirePermission("dashboard", "read")
  @ApiOperation({ summary: "Dashboard summary with optional date range" })
  async getSummary(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const includeAudit = user
      ? await this.casbinService.enforce(
          this.casbinService.subjectForUser(user.id),
          "audit",
          "read",
        )
      : false;
    return this.dashboardService.getSummary(from, to, { includeAudit });
  }
}
