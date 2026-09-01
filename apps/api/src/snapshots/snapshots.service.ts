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
const MAX_DUMP_BUFFER = 1024 * 1024 * 100;

function isCommandNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function dumpErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) {
      return error.stderr.trim();
    }
    return error.message;
  }
  return "pg_dump failed";
}

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
      await this.createDumpFile(databaseUrl, filePath);
    } catch (error: unknown) {
      throw new InternalServerErrorException(
        `Failed to create database snapshot: ${dumpErrorMessage(error)}`,
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

  private async createDumpFile(databaseUrl: string, filePath: string) {
    const pgDumpBin =
      this.configService.get<string>("PG_DUMP_PATH") ?? "pg_dump";

    try {
      await execFileAsync(
        pgDumpBin,
        [`--dbname=${databaseUrl}`, "-f", filePath],
        {
          env: process.env,
          maxBuffer: MAX_DUMP_BUFFER,
        },
      );
      return;
    } catch (error: unknown) {
      if (!isCommandNotFound(error)) {
        throw error;
      }
    }

    await this.createDumpFileViaDocker(filePath);
  }

  private async createDumpFileViaDocker(filePath: string) {
    const container =
      this.configService.get<string>("POSTGRES_CONTAINER") ??
      "profitability-tracker-postgres";
    const user = this.configService.get<string>("POSTGRES_USER") ?? "postgres";
    const db =
      this.configService.get<string>("POSTGRES_DB") ?? "profitability_tracker";

    try {
      const { stdout } = await execFileAsync(
        "docker",
        [
          "exec",
          container,
          "pg_dump",
          "-U",
          user,
          "-d",
          db,
          "--no-owner",
          "--no-acl",
        ],
        {
          env: process.env,
          maxBuffer: MAX_DUMP_BUFFER,
          encoding: "buffer",
        },
      );
      await fs.writeFile(filePath, stdout);
    } catch (error: unknown) {
      if (isCommandNotFound(error)) {
        throw new Error(
          "pg_dump is not installed locally and the docker CLI is unavailable. Install PostgreSQL client tools or Docker.",
        );
      }
      throw new Error(
        `docker exec pg_dump failed for container "${container}": ${dumpErrorMessage(error)}`,
      );
    }
  }
}
