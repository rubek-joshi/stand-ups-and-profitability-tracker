-- User preference for project theme accents on stand-up pages.
CREATE TYPE "StandupProjectAccentPreference" AS ENUM ('off', 'muted', 'on');

ALTER TABLE "users"
  ADD COLUMN "standupProjectAccentPreference" "StandupProjectAccentPreference" NOT NULL DEFAULT 'muted';
