/*
  Warnings:

  - You are about to drop the column `categoryId` on the `projects` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_categoryId_fkey";

-- DropIndex
DROP INDEX "projects_categoryId_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "categoryId";

-- CreateTable
CREATE TABLE "project_categories" (
    "projectId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_categories_pkey" PRIMARY KEY ("projectId","categoryId")
);

-- CreateIndex
CREATE INDEX "project_categories_categoryId_idx" ON "project_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_categories" ADD CONSTRAINT "project_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
