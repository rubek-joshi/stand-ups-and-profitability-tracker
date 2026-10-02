import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { QueuesModule } from "../queues/queues.module.js";
import { StandupsModule } from "../standups/standups.module.js";
import { UsersModule } from "../users/users.module.js";
import { JobsService } from "./jobs.service.js";

@Module({
  imports: [ScheduleModule.forRoot(), QueuesModule, StandupsModule, UsersModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
