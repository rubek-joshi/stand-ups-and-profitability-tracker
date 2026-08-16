/*
  Warnings:

  - You are about to drop the `standup_project_overrides` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "standup_project_overrides" DROP CONSTRAINT "standup_project_overrides_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "standup_project_overrides" DROP CONSTRAINT "standup_project_overrides_projectId_fkey";

-- DropForeignKey
ALTER TABLE "standup_project_overrides" DROP CONSTRAINT "standup_project_overrides_standupId_fkey";

-- DropTable
DROP TABLE "standup_project_overrides";
