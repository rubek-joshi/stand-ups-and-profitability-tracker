import {
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuditAction } from "@workspace/database";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

const execFileAsync = promisify(execFile);

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async download(actorId: string) {
    const databaseUrl = this.configService.get<string>("DATABASE_URL");
    if (!databaseUrl) {
      throw new InternalServerErrorException("DATABASE_URL is not configured");
    }
    const snapshotsDir = resolve(
      process.cwd(),
      this.configService.get<string>("SNAPSHOTS_DIR") ?? "snapshots",
    );
    await fs.mkdir(snapshotsDir, { recursive: true });
    const existing = await fs.readdir(snapshotsDir);
    for (const file of existing) {
      await fs.unlink(resolve(snapshotsDir, file));
    }
    await this.prismaService.dbSnapshot.deleteMany();
    const fileName = `db-snapshot-${Date.now()}.sql`;
    const filePath = resolve(snapshotsDir, fileName);
    try {
      await execFileAsync("pg_dump", [databaseUrl, "-f", filePath], {
        env: process.env,
        maxBuffer: 1024 * 1024 * 100,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "pg_dump failed";
      throw new InternalServerErrorException(
        `Failed to create database snapshot: ${message}`,
      );
    }
    const stats = await fs.stat(filePath);
    const snapshot = await this.prismaService.dbSnapshot.create({
      data: {
        fileName,
        filePath,
        sizeBytes: BigInt(stats.size),
        createdById: actorId,
      },
    });
    await this.auditService.write({
      actorId,
      action: AuditAction.DB_SNAPSHOT_DOWNLOADED,
      targetType: "DbSnapshot",
      targetId: snapshot.id,
      metadata: {
        fileName,
        sizeBytes: String(stats.size),
      },
    });
    return {
      id: snapshot.id,
      fileName: snapshot.fileName,
      filePath: snapshot.filePath,
      sizeBytes: String(snapshot.sizeBytes),
      createdAt: snapshot.createdAt,
    };
  }
}
