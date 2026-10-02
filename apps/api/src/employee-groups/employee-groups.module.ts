import { Module } from "@nestjs/common";
import { EmployeeGroupsController } from "./employee-groups.controller.js";
import { EmployeeGroupsService } from "./employee-groups.service.js";

@Module({
  controllers: [EmployeeGroupsController],
  providers: [EmployeeGroupsService],
  exports: [EmployeeGroupsService],
})
export class EmployeeGroupsModule {}
