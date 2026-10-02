-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('ACCEPTANCE', 'CHECKLIST');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATES');

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "description" JSONB,
ADD COLUMN     "descriptionText" TEXT;

-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "kind" "ChecklistKind" NOT NULL,
    "title" TEXT NOT NULL,
    "rank" TEXT COLLATE "C" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "rank" TEXT COLLATE "C" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_links" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,
    "type" "LinkType" NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_watchers" (
    "workItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_watchers_pkey" PRIMARY KEY ("workItemId","userId")
);

-- CreateIndex
CREATE INDEX "checklists_workItemId_idx" ON "checklists"("workItemId");

-- CreateIndex
CREATE INDEX "checklist_items_checklistId_idx" ON "checklist_items"("checklistId");

-- CreateIndex
CREATE INDEX "work_item_links_toId_idx" ON "work_item_links"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_links_fromId_toId_type_key" ON "work_item_links"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "work_item_watchers_userId_idx" ON "work_item_watchers"("userId");

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_toId_fkey" FOREIGN KEY ("toId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_watchers" ADD CONSTRAINT "work_item_watchers_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_watchers" ADD CONSTRAINT "work_item_watchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_watchers" ADD CONSTRAINT "work_item_watchers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

