import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { QueuesModule } from "../queues/queues.module";
import { StandupsModule } from "../standups/standups.module";
import { JobsService } from "./jobs.service";

@Module({
  imports: [ScheduleModule.forRoot(), QueuesModule, StandupsModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
