import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { QueuesModule } from "../queues/queues.module";
import { JobsService } from "./jobs.service";

@Module({
  imports: [ScheduleModule.forRoot(), QueuesModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
