import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
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
  @ApiOperation({ summary: "Get accumulated VAT totals (optional period filter)" })
  async getAccumulated(
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.vatService.getAccumulatedUnpaid({ from, to });
  }

  @Get("entries")
  @RequirePermission("vat", "read")
  @ApiOperation({ summary: "List accrued VAT line items" })
  async listEntries(
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.vatService.listEntries({ from, to });
  }

  @Post("mark-paid")
  @RequirePermission("vat", "*")
  @ApiOperation({
    summary: "Record a VAT clearance (full unpaid balance or partial amountNpr)",
  })
  async markPaid(
    @Body() dto: MarkVatPaidDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vatService.markPaid(dto, user.id);
  }

  @Get("clearances")
  @RequirePermission("vat", "read")
  @ApiOperation({ summary: "List VAT clearances" })
  async listClearances(
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.vatService.listClearances({ from, to });
  }
}
