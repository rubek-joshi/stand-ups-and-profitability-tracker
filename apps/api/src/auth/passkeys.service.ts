import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AuditAction } from "@workspace/database";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { deviceNameFromHeaders } from "./device-name.util";
import type { IncomingHttpHeaders } from "node:http";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PasskeysService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async list(userId: string) {
    const passkeys = await this.prismaService.userPasskey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
        deviceType: true,
      },
    });
    return passkeys;
  }

  async registrationOptions(userId: string) {
    const user = await this.usersService.findById(userId);
    const existing = await this.prismaService.userPasskey.findMany({
      where: { userId },
    });
    const { rpID, rpName } = this.rpConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: this.transports(passkey.transports),
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });
    const challenge = await this.saveChallenge(
      "registration",
      options.challenge,
      userId,
    );
    return { challengeId: challenge.id, options };
  }

  async verifyRegistration(
    userId: string,
    challengeId: string,
    credential: Record<string, unknown>,
    headers?: IncomingHttpHeaders,
  ) {
    const challenge = await this.consumeChallenge(challengeId, "registration");
    if (challenge.userId !== userId) {
      throw new UnauthorizedException("Invalid passkey challenge");
    }
    const { origin, rpID } = this.rpConfig();
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: credential as unknown as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch {
      throw new BadRequestException("Could not verify this passkey");
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException("Could not verify this passkey");
    }
    const { credential: cred, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    const name = await this.uniquePasskeyName(
      userId,
      deviceNameFromHeaders(headers ?? {}) ?? "Passkey",
    );
    const passkey = await this.prismaService.userPasskey.create({
      data: {
        userId,
        credentialId: cred.id,
        publicKey: Buffer.from(cred.publicKey),
        counter: BigInt(cred.counter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: cred.transports ? [...cred.transports] : [],
        name,
      },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
        deviceType: true,
      },
    });
    await this.auditService.write({
      actorId: userId,
      action: AuditAction.USER_PASSKEY_ADDED,
      targetType: "UserPasskey",
      targetId: passkey.id,
    });
    return passkey;
  }

  async loginOptions(email?: string) {
    const { rpID } = this.rpConfig();
    let userId: string | null = null;
    let allowCredentials:
      | Array<{ id: string; transports?: AuthenticatorTransportFuture[] }>
      | undefined;
    const normalizedEmail = email?.trim();
    if (normalizedEmail) {
      const user = await this.usersService.findByEmail(normalizedEmail);
      if (!user || !user.isActive) {
        throw new UnauthorizedException("Invalid credentials");
      }
      const passkeys = await this.prismaService.userPasskey.findMany({
        where: { userId: user.id },
      });
      if (passkeys.length === 0) {
        throw new UnauthorizedException("Invalid credentials");
      }
      userId = user.id;
      allowCredentials = passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: this.transports(passkey.transports),
      }));
    }
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials,
    });
    const challenge = await this.saveChallenge(
      "authentication",
      options.challenge,
      userId,
    );
    return { challengeId: challenge.id, options };
  }

  async verifyLogin(challengeId: string, credential: Record<string, unknown>) {
    const challenge = await this.consumeChallenge(
      challengeId,
      "authentication",
    );
    const credentialId =
      typeof credential.id === "string" ? credential.id : null;
    if (!credentialId) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const passkey = await this.prismaService.userPasskey.findUnique({
      where: { credentialId },
    });
    if (!passkey) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (challenge.userId && challenge.userId !== passkey.userId) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const user = await this.usersService.findById(passkey.userId);
    if (!user.isActive) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const { origin, rpID } = this.rpConfig();
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential as unknown as AuthenticationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: this.transports(passkey.transports),
        },
      });
    } catch {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (!verification.verified) {
      throw new UnauthorizedException("Invalid credentials");
    }
    await this.prismaService.userPasskey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    const updated = await this.usersService.recordLogin(user.id);
    const accessToken = await this.jwtService.signAsync({
      sub: updated.id,
      email: updated.email,
    });
    return {
      accessToken,
      user: await this.usersService.toResponseAsync(updated),
    };
  }

  async rename(userId: string, passkeyId: string, name: string) {
    const passkey = await this.requireOwned(userId, passkeyId);
    const updated = await this.prismaService.userPasskey.update({
      where: { id: passkey.id },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
        deviceType: true,
      },
    });
    await this.auditService.write({
      actorId: userId,
      action: AuditAction.USER_PASSKEY_UPDATED,
      targetType: "UserPasskey",
      targetId: passkey.id,
    });
    return updated;
  }

  async remove(userId: string, passkeyId: string) {
    const passkey = await this.requireOwned(userId, passkeyId);
    await this.prismaService.userPasskey.delete({ where: { id: passkey.id } });
    await this.auditService.write({
      actorId: userId,
      action: AuditAction.USER_PASSKEY_REMOVED,
      targetType: "UserPasskey",
      targetId: passkey.id,
    });
    return { ok: true };
  }

  private async uniquePasskeyName(userId: string, base: string): Promise<string> {
    const existing = await this.prismaService.userPasskey.findMany({
      where: { userId },
      select: { name: true },
    });
    const names = new Set(existing.map((passkey) => passkey.name));
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} (${index})`)) {
      index += 1;
    }
    return `${base} (${index})`.slice(0, 80);
  }

  private async requireOwned(userId: string, passkeyId: string) {
    const passkey = await this.prismaService.userPasskey.findUnique({
      where: { id: passkeyId },
    });
    if (!passkey || passkey.userId !== userId) {
      throw new NotFoundException("Passkey not found");
    }
    return passkey;
  }

  private rpConfig() {
    const origin = (
      this.configService.get<string>("CORS_ORIGIN") ?? "http://localhost:4100"
    ).replace(/\/$/, "");
    let rpID = "localhost";
    try {
      rpID = new URL(origin).hostname;
    } catch {
      rpID = "localhost";
    }
    return { rpName: "Tracker", rpID, origin };
  }

  private transports(values: string[]): AuthenticatorTransportFuture[] | undefined {
    if (!values.length) return undefined;
    return values as AuthenticatorTransportFuture[];
  }

  private async saveChallenge(
    purpose: string,
    challenge: string,
    userId?: string | null,
  ) {
    await this.prismaService.webAuthnChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return this.prismaService.webAuthnChallenge.create({
      data: {
        purpose,
        challenge,
        userId: userId ?? null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
  }

  private async consumeChallenge(id: string, purpose: string) {
    const row = await this.prismaService.webAuthnChallenge.findUnique({
      where: { id },
    });
    if (!row || row.purpose !== purpose || row.expiresAt < new Date()) {
      throw new UnauthorizedException("Passkey challenge expired. Try again.");
    }
    await this.prismaService.webAuthnChallenge.delete({ where: { id } });
    return row;
  }
}
