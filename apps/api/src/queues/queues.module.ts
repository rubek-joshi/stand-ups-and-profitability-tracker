import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MailModule } from "../mail/mail.module";
import { MailProcessor } from "./mail.processor";
import { MAIL_QUEUE } from "./queue.constants";
import { QueuesService } from "./queues.service";

@Module({
  imports: [
    MailModule,
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
    BullModule.registerQueue({ name: MAIL_QUEUE }),
  ],
  providers: [QueuesService, MailProcessor],
  exports: [QueuesService],
})
export class QueuesModule {}
