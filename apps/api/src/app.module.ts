import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscoveryModule } from "@nestjs/core";
import { Rfc9457Module } from "@camcima/nestjs-rfc9457";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { CasbinModule } from "./casbin/casbin.module";
import { HealthModule } from "./health/health.module";
import { MailModule } from "./mail/mail.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueuesModule } from "./queues/queues.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, "../../../.env"),
    }),
    DiscoveryModule,
    Rfc9457Module.forRoot({
      suppress5xxDetail: true,
    }),
    PrismaModule,
    CasbinModule,
    UsersModule,
    AuthModule,
    MailModule,
    QueuesModule,
    HealthModule,
  ],
})
export class AppModule {}
