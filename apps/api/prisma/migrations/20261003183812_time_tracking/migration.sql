-- CreateEnum
CREATE TYPE "TimeSource" AS ENUM ('MANUAL', 'TIMER');

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "userId" UUID,
    "day" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "source" "TimeSource" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_timers" (
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_timers_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "time_entries_workItemId_idx" ON "time_entries"("workItemId");

-- CreateIndex
CREATE INDEX "time_entries_userId_day_idx" ON "time_entries"("userId", "day");

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_timers" ADD CONSTRAINT "active_timers_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bir giriş 1 dakika ile 24 saat arasındadır (ADR-075).
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_minutes_check" CHECK ("minutes" BETWEEN 1 AND 1440);
