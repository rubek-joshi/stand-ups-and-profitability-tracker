import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuditAction } from "@workspace/database";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuditService } from "./audit.service";

@ApiTags("audit")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("actors")
  @RequirePermission("audit", "read")
  @ApiOperation({ summary: "List actors for audit filters" })
  @ApiOkResponse()
  async listActors() {
    return this.auditService.listActors();
  }

  @Get()
  @RequirePermission("audit", "read")
  @ApiOperation({ summary: "List audit logs (super admin)" })
  @ApiOkResponse()
  async findAll(
    @Query("action") action?: AuditAction,
    @Query("actorId") actorId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    return this.auditService.findAll({
      action,
      actorId,
      page,
      pageSize,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
