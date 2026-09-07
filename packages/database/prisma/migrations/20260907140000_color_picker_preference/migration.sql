-- CreateEnum
CREATE TYPE "ColorPickerPreference" AS ENUM ('classic', 'blossom');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "colorPickerPreference" "ColorPickerPreference" NOT NULL DEFAULT 'classic';
