-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('EPIC', 'STORY', 'TASK', 'SUBTASK', 'BUG');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'TRIVIAL');

-- CreateEnum
CREATE TYPE "TshirtSize" AS ENUM ('S', 'M', 'L', 'XL');

-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "itemCounter" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "parentId" UUID,
    "type" "WorkItemType" NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "statusId" UUID NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "reporterId" UUID,
    "startDate" DATE,
    "dueDate" DATE,
    "points" DOUBLE PRECISION,
    "estimateHours" DOUBLE PRECISION,
    "completedAt" TIMESTAMPTZ,
    "rank" TEXT COLLATE "C" NOT NULL,
    "severity" "BugSeverity",
    "stepsToReproduce" TEXT,
    "expectedResult" TEXT,
    "actualResult" TEXT,
    "environment" TEXT,
    "foundInVersion" TEXT,
    "goal" TEXT,
    "tshirtSize" "TshirtSize",
    "color" TEXT,
    "externalSource" TEXT,
    "externalId" TEXT,
    "archivedAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_assignees" (
    "workItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_assignees_pkey" PRIMARY KEY ("workItemId","userId")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_labels" (
    "workItemId" UUID NOT NULL,
    "labelId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,

    CONSTRAINT "work_item_labels_pkey" PRIMARY KEY ("workItemId","labelId")
);

-- CreateIndex
CREATE INDEX "work_items_listId_rank_idx" ON "work_items"("listId", "rank");

-- CreateIndex
CREATE INDEX "work_items_spaceId_idx" ON "work_items"("spaceId");

-- CreateIndex
CREATE INDEX "work_items_parentId_idx" ON "work_items"("parentId");

-- CreateIndex
CREATE INDEX "work_items_statusId_idx" ON "work_items"("statusId");

-- CreateIndex
CREATE INDEX "work_items_workspaceId_externalSource_externalId_idx" ON "work_items"("workspaceId", "externalSource", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "work_items_workspaceId_keyPrefix_number_key" ON "work_items"("workspaceId", "keyPrefix", "number");

-- CreateIndex
CREATE INDEX "work_item_assignees_userId_idx" ON "work_item_assignees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "labels_spaceId_name_key" ON "labels"("spaceId", "name");

-- CreateIndex
CREATE INDEX "work_item_labels_labelId_idx" ON "work_item_labels"("labelId");

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_assignees" ADD CONSTRAINT "work_item_assignees_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

