-- CreateEnum
CREATE TYPE "RetroColumn" AS ENUM ('WENT_WELL', 'IMPROVE', 'ACTION');

-- CreateTable
CREATE TABLE "retro_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sprintId" UUID NOT NULL,
    "column" "RetroColumn" NOT NULL,
    "text" TEXT NOT NULL,
    "authorId" UUID,
    "taskId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retro_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retro_votes" (
    "retroItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,

    CONSTRAINT "retro_votes_pkey" PRIMARY KEY ("retroItemId","userId")
);

-- CreateIndex
CREATE INDEX "retro_items_sprintId_createdAt_idx" ON "retro_items"("sprintId", "createdAt");

-- AddForeignKey
ALTER TABLE "retro_items" ADD CONSTRAINT "retro_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_items" ADD CONSTRAINT "retro_items_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_items" ADD CONSTRAINT "retro_items_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_items" ADD CONSTRAINT "retro_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_votes" ADD CONSTRAINT "retro_votes_retroItemId_fkey" FOREIGN KEY ("retroItemId") REFERENCES "retro_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_votes" ADD CONSTRAINT "retro_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retro_votes" ADD CONSTRAINT "retro_votes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
