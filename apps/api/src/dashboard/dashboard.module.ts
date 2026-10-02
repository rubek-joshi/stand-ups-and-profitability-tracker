import { Module } from "@nestjs/common";
import { CasbinModule } from "../casbin/casbin.module.js";
import { ProfitabilityModule } from "../profitability/profitability.module.js";
import { VatModule } from "../vat/vat.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [ProfitabilityModule, VatModule, CasbinModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
