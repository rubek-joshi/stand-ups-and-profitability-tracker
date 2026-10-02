import { Module } from "@nestjs/common";
import { QueuesModule } from "../queues/queues.module.js";
import { CoreMembersController } from "./core-members.controller.js";
import { CoreMembersService } from "./core-members.service.js";

@Module({
  imports: [QueuesModule],
  controllers: [CoreMembersController],
  providers: [CoreMembersService],
  exports: [CoreMembersService],
})
export class CoreMembersModule {}
