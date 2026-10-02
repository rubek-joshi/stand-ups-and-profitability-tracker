import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module.js";
import { StandupsModule } from "../standups/standups.module.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectsService } from "./projects.service.js";

@Module({
  imports: [ProfitabilityModule, StandupsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
