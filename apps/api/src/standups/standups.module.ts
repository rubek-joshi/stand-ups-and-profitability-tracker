import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { StandupsController } from "./standups.controller";
import { StandupsService } from "./standups.service";

@Module({
  imports: [ProfitabilityModule],
  controllers: [StandupsController],
  providers: [StandupsService],
  exports: [StandupsService],
})
export class StandupsModule {}
