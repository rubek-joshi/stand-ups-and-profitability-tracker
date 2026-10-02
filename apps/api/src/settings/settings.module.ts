import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.js";
import { ProfitabilityModule } from "../profitability/profitability.module.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [MailModule, ProfitabilityModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
