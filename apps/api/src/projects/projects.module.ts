import { Module } from "@nestjs/common";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { StandupsModule } from "../standups/standups.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [ProfitabilityModule, StandupsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
