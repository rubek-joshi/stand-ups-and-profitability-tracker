import { Module } from "@nestjs/common";
import { ProfitabilityService } from "./profitability.service";

@Module({
  providers: [ProfitabilityService],
  exports: [ProfitabilityService],
})
export class ProfitabilityModule {}
