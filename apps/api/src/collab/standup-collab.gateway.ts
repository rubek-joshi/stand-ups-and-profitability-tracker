import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import * as Y from "yjs";
import { PrismaService } from "../prisma/prisma.service.js";

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    userName?: string;
    standupId?: string;
  };
};

@WebSocketGateway({
  namespace: "/standup-collab",
  cors: { origin: true, credentials: true },
})
export class StandupCollabGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(StandupCollabGateway.name);
  private readonly docs = new Map<string, Y.Doc>();
  private readonly persistChains = new Map<string, Promise<void>>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.disconnect();
        return;
      }
      const secret = this.configService.get<string>("JWT_SECRET");
      if (!secret) {
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
      }>(token, { secret });
      const user = await this.prismaService.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || !user.isActive) {
        client.disconnect();
        return;
      }
      client.data.userId = user.id;
      client.data.userName = user.name;
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${String(error)}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const standupId = client.data.standupId;
    if (!standupId) return;
    client.to(this.room(standupId)).emit("presence:leave", {
      userId: client.data.userId,
      userName: client.data.userName,
    });
    // Evict in-memory doc when the room is empty so the next join reloads DB.
    try {
      const sockets = await this.server.in(this.room(standupId)).fetchSockets();
      if (sockets.length === 0) {
        const doc = this.docs.get(standupId);
        if (doc) {
          await this.persistDoc(standupId, doc);
          doc.destroy();
          this.docs.delete(standupId);
          this.persistChains.delete(standupId);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup standup room ${standupId}: ${String(error)}`,
      );
    }
  }

  @SubscribeMessage("standup:join")
  async join(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { standupId: string },
  ): Promise<{
    state: string;
    peers: Array<{ userId: string; userName: string }>;
  }> {
    const standupId = body.standupId;
    const standup = await this.prismaService.standup.findUnique({
      where: { id: standupId },
    });
    if (!standup) {
      throw new Error("Standup not found");
    }
    const previousStandupId = client.data.standupId;
    if (previousStandupId && previousStandupId !== standupId) {
      await client.leave(this.room(previousStandupId));
    }
    client.data.standupId = standupId;
    await client.join(this.room(standupId));
    const doc = await this.getOrLoadDoc(standupId, standup.yjsState);
    const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
    client.to(this.room(standupId)).emit("presence:join", {
      userId: client.data.userId,
      userName: client.data.userName,
    });
    const sockets = await this.server.in(this.room(standupId)).fetchSockets();
    const peers = sockets
      .map((s) => ({
        userId: (s.data as AuthedSocket["data"]).userId ?? "",
        userName: (s.data as AuthedSocket["data"]).userName ?? "",
      }))
      .filter((p) => p.userId);
    return { state, peers };
  }

  @SubscribeMessage("yjs:update")
  async onUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { standupId: string; update: string },
  ): Promise<void> {
    if (!this.clientMayWrite(client, body.standupId)) {
      return;
    }
    const doc = this.docs.get(body.standupId);
    if (!doc) {
      return;
    }
    const update = Buffer.from(body.update, "base64");
    Y.applyUpdate(doc, update);
    client.to(this.room(body.standupId)).emit("yjs:update", {
      update: body.update,
      userId: client.data.userId,
    });
    await this.persistDoc(body.standupId, doc);
  }

  @SubscribeMessage("awareness:update")
  onAwareness(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { standupId: string; awareness: Record<string, unknown> },
  ): void {
    if (!this.clientMayWrite(client, body.standupId)) {
      return;
    }
    client.to(this.room(body.standupId)).emit("awareness:update", {
      userId: client.data.userId,
      userName: client.data.userName,
      awareness: body.awareness,
    });
  }

  private clientMayWrite(client: AuthedSocket, standupId: string): boolean {
    return Boolean(
      client.data.userId &&
        client.data.standupId &&
        client.data.standupId === standupId,
    );
  }

  private room(standupId: string): string {
    return `standup:${standupId}`;
  }

  private async getOrLoadDoc(
    standupId: string,
    yjsState: Uint8Array | null,
  ): Promise<Y.Doc> {
    const existing = this.docs.get(standupId);
    if (existing) {
      return existing;
    }
    const doc = new Y.Doc();
    if (yjsState && yjsState.length > 0) {
      Y.applyUpdate(doc, yjsState);
    }
    this.docs.set(standupId, doc);
    return doc;
  }

  /**
   * Serialize persists per stand-up so overlapping keystrokes cannot commit
   * an older full snapshot after a newer one.
   */
  private persistDoc(standupId: string, doc: Y.Doc): Promise<void> {
    const previous = this.persistChains.get(standupId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const state = Buffer.from(Y.encodeStateAsUpdate(doc));
        await this.prismaService.standup.update({
          where: { id: standupId },
          data: { yjsState: state },
        });
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to persist yjsState for ${standupId}: ${String(error)}`,
        );
      });
    this.persistChains.set(standupId, next);
    return next;
  }
}
