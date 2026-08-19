-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSKEY_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSKEY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'USER_PASSKEY_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'SETTINGS_SMTP_TESTED';

-- AlterTable
ALTER TABLE "org_settings"
  ADD COLUMN "smtpHost" TEXT,
  ADD COLUMN "smtpPort" INTEGER NOT NULL DEFAULT 587,
  ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smtpUser" TEXT,
  ADD COLUMN "smtpPass" TEXT,
  ADD COLUMN "smtpFrom" TEXT;

-- CreateTable
CREATE TABLE "user_passkeys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_passkeys_credentialId_key" ON "user_passkeys"("credentialId");

-- CreateIndex
CREATE INDEX "user_passkeys_userId_idx" ON "user_passkeys"("userId");

-- CreateIndex
CREATE INDEX "webauthn_challenges_expiresAt_idx" ON "webauthn_challenges"("expiresAt");

-- AddForeignKey
ALTER TABLE "user_passkeys" ADD CONSTRAINT "user_passkeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
