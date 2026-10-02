import { Module } from "@nestjs/common";
import { VatController } from "./vat.controller.js";
import { VatService } from "./vat.service.js";

@Module({
  controllers: [VatController],
  providers: [VatService],
  exports: [VatService],
})
export class VatModule {}
