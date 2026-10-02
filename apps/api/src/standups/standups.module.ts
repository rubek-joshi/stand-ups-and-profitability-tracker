import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module.js";
import { StandupsController } from "./standups.controller.js";
import { StandupsService } from "./standups.service.js";

@Module({
  imports: [ProfitabilityModule],
  controllers: [StandupsController],
  providers: [StandupsService],
  exports: [StandupsService],
})
export class StandupsModule {}
