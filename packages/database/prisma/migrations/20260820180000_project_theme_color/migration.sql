-- App primary teal (--primary ≈ oklch(0.508 0.118 165.612)) as hex for stand-up accents.
ALTER TABLE "projects" ADD COLUMN "themeColor" TEXT NOT NULL DEFAULT '#168A6F';

UPDATE "projects" SET "themeColor" = '#168A6F';
