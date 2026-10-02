import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasskeysService } from "./passkeys.service.js";
import { JwtStrategy } from "./jwt.strategy.js";

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>("JWT_SECRET");
        if (!secret) {
          throw new Error("JWT_SECRET must be set in the root .env");
        }
        const expiresIn = configService.get<string>("JWT_EXPIRES_IN") ?? "7d";
        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as `${number}d` | `${number}h` | `${number}s`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasskeysService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
