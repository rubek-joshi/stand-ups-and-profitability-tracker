import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module.js";
import { ClientsController } from "./clients.controller.js";
import { ClientsService } from "./clients.service.js";

@Module({
  imports: [ProfitabilityModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
