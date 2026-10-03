-- CreateTable
CREATE TABLE "sprint_snapshots" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "sprintId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "donePoints" DOUBLE PRECISION NOT NULL,
    "remainingPoints" DOUBLE PRECISION NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "doneItems" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sprint_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sprint_snapshots_sprintId_date_key" ON "sprint_snapshots"("sprintId", "date");

-- AddForeignKey
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "sprints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
