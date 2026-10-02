import { z } from "zod";

/**
 * Environment variables validated at bootstrap via ConfigModule.
 * Unknown keys are preserved so other process.env values remain available.
 */
export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    JWT_EXPIRES_IN: z.string().default("7d"),
    API_PORT: z.string().default("4101"),
    CORS_ORIGIN: z.string().default("http://localhost:4100"),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.string().default("6679"),
    SMTP_HOST: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_SECURE: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SNAPSHOTS_DIR: z.string().optional(),
    PG_DUMP_PATH: z.string().optional(),
    POSTGRES_CONTAINER: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_DB: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "production", "test", "provision"])
      .optional(),
  })
  .passthrough();

export type Env = z.infer<typeof envSchema>;
