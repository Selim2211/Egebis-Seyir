-- CreateEnum
CREATE TYPE "SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SprintItemAction" AS ENUM ('ADDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "SprintItemReason" AS ENUM ('PLANNED', 'SCOPE_CHANGE', 'CARRIED_OVER');

-- DropIndex
DROP INDEX "work_items_title_trgm_idx";

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "backlogRank" TEXT COLLATE "C",
ADD COLUMN     "sprintId" UUID;

-- CreateTable
CREATE TABLE "sprints" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "capacityNote" TEXT,
    "status" "SprintStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "cancelledAt" TIMESTAMPTZ,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprint_item_events" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sprintId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "action" "SprintItemAction" NOT NULL,
    "reason" "SprintItemReason" NOT NULL,
    "points" DOUBLE PRECISION,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sprint_item_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sprints_spaceId_status_idx" ON "sprints"("spaceId", "status");

-- CreateIndex
CREATE INDEX "sprint_item_events_sprintId_createdAt_idx" ON "sprint_item_events"("sprintId", "createdAt");

-- CreateIndex
CREATE INDEX "sprint_item_events_workItemId_idx" ON "sprint_item_events"("workItemId");

-- CreateIndex
CREATE INDEX "work_items_spaceId_backlogRank_idx" ON "work_items"("spaceId", "backlogRank");

-- CreateIndex
CREATE INDEX "work_items_sprintId_idx" ON "work_items"("sprintId");

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprint_item_events" ADD CONSTRAINT "sprint_item_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprint_item_events" ADD CONSTRAINT "sprint_item_events_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprint_item_events" ADD CONSTRAINT "sprint_item_events_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Space başına en çok bir aktif sprint (brief §6.1.1, ADR-061).
CREATE UNIQUE INDEX "sprints_one_active_per_space" ON "sprints"("spaceId") WHERE "status" = 'ACTIVE';

-- Başlangıç bitişten sonra olamaz.
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_dates_check" CHECK ("startDate" <= "endDate");
