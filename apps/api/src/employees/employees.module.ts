import { Module } from "@nestjs/common";
import { QueuesModule } from "../queues/queues.module.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesService } from "./employees.service.js";

@Module({
  imports: [QueuesModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
