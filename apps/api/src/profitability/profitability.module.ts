import { Module } from "@nestjs/common";
import { ProfitabilityService } from "./profitability.service.js";

@Module({
  providers: [ProfitabilityService],
  exports: [ProfitabilityService],
})
export class ProfitabilityModule {}
