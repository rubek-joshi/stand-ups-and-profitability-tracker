import { Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { SnapshotsService } from "./snapshots.service";

@ApiTags("snapshots")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("snapshots")
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @Post("download")
  @RequirePermission("snapshots", "*")
  @ApiOperation({ summary: "Create and register a DB snapshot (super admin)" })
  async download(@CurrentUser() user: AuthUser) {
    return this.snapshotsService.download(user.id);
  }
}
