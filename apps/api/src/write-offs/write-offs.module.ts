import { Module } from '@nestjs/common';
import { ProfitabilityModule } from '../profitability/profitability.module';
import { WriteOffsController } from './write-offs.controller';
import { WriteOffsService } from './write-offs.service';

@Module({
  imports: [ProfitabilityModule],
  controllers: [WriteOffsController],
  providers: [WriteOffsService],
  exports: [WriteOffsService],
})
export class WriteOffsModule {}
