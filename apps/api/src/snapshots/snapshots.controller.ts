import {
  Controller,
  Header,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createReadStream } from "node:fs";
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
  @Header("Content-Type", "application/sql")
  @ApiOperation({
    summary: "Create a DB snapshot and download it (super admin)",
  })
  async download(@CurrentUser() user: AuthUser) {
    const snapshot = await this.snapshotsService.download(user.id);
    return new StreamableFile(createReadStream(snapshot.filePath), {
      disposition: `attachment; filename="${snapshot.fileName}"`,
    });
  }
}
