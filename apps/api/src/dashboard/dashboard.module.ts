import { Module } from "@nestjs/common";
import { CasbinModule } from "../casbin/casbin.module";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { VatModule } from "../vat/vat.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [ProfitabilityModule, VatModule, CasbinModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
