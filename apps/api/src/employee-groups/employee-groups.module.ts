import { Module } from "@nestjs/common";
import { EmployeeGroupsController } from "./employee-groups.controller";
import { EmployeeGroupsService } from "./employee-groups.service";

@Module({
  controllers: [EmployeeGroupsController],
  providers: [EmployeeGroupsService],
  exports: [EmployeeGroupsService],
})
export class EmployeeGroupsModule {}
