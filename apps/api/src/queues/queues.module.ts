import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MailModule } from "../mail/mail.module";
import { ProfitabilityModule } from "../profitability/profitability.module";
import { MailProcessor } from "./mail.processor";
import { MAIL_QUEUE, RECALCULATE_QUEUE } from "./queue.constants";
import { QueuesService } from "./queues.service";
import { RecalculateProcessor } from "./recalculate.processor";

@Module({
  imports: [
    MailModule,
    ProfitabilityModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>("REDIS_HOST", "localhost"),
          port: Number(configService.get<string>("REDIS_PORT") ?? 6679),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: MAIL_QUEUE },
      { name: RECALCULATE_QUEUE },
    ),
  ],
  providers: [QueuesService, MailProcessor, RecalculateProcessor],
  exports: [QueuesService],
})
export class QueuesModule {}
