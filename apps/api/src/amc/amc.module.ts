import { Module } from "@nestjs/common";
import { AmcController } from "./amc.controller.js";
import { AmcService } from "./amc.service.js";

@Module({
  controllers: [AmcController],
  providers: [AmcService],
  exports: [AmcService],
})
export class AmcModule {}
