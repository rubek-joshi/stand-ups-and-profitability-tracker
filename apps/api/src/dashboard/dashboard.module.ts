import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { VatModule } from "../vat/vat.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [ProfitabilityModule, VatModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
