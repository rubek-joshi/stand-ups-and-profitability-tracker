import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { StandupCollabGateway } from "./standup-collab.gateway.js";

@Module({
  imports: [JwtModule.register({})],
  providers: [StandupCollabGateway],
})
export class CollabModule {}
