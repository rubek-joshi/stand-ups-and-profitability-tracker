import { Module } from '@nestjs/common';
import { ProfitabilityModule } from '../profitability/profitability.module.js';
import { WriteOffsController } from './write-offs.controller.js';
import { WriteOffsService } from './write-offs.service.js';

@Module({
  imports: [ProfitabilityModule],
  controllers: [WriteOffsController],
  providers: [WriteOffsService],
  exports: [WriteOffsService],
})
export class WriteOffsModule {}
