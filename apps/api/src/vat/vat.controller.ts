import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { MarkVatPaidDto } from "./dto/mark-vat-paid.dto";
import { VatService } from "./vat.service";

@ApiTags("vat")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("vat")
export class VatController {
  constructor(private readonly vatService: VatService) {}

  @Get("accumulated")
  @RequirePermission("vat", "read")
  @ApiOperation({ summary: "Get accumulated unpaid VAT" })
  async getAccumulated() {
    return this.vatService.getAccumulatedUnpaid();
  }

  @Post("mark-paid")
  @RequirePermission("vat", "*")
  @ApiOperation({ summary: "Mark accumulated VAT as paid" })
  async markPaid(
    @Body() dto: MarkVatPaidDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vatService.markPaid(dto, user.id);
  }

  @Get("clearances")
  @RequirePermission("vat", "read")
  @ApiOperation({ summary: "List VAT clearances" })
  async listClearances() {
    return this.vatService.listClearances();
  }
}
