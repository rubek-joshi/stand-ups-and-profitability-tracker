import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [MailModule, ProfitabilityModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
