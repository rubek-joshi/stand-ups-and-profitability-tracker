import { Module } from "@nestjs/common";
import { QueuesModule } from "../queues/queues.module";
import { CoreMembersController } from "./core-members.controller";
import { CoreMembersService } from "./core-members.service";

@Module({
  imports: [QueuesModule],
  controllers: [CoreMembersController],
  providers: [CoreMembersService],
  exports: [CoreMembersService],
})
export class CoreMembersModule {}
