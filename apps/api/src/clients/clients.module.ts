import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";

@Module({
  imports: [ProfitabilityModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
