import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { QueuesModule } from "../queues/queues.module";
import { StandupsModule } from "../standups/standups.module";
import { UsersModule } from "../users/users.module";
import { JobsService } from "./jobs.service";

@Module({
  imports: [ScheduleModule.forRoot(), QueuesModule, StandupsModule, UsersModule],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
