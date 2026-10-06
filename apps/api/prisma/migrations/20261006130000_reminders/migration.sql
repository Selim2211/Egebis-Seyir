-- Kişisel görev hatırlatıcıları (Faz 7.3).
ALTER TYPE "NotificationType" ADD VALUE 'REMINDER';

CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "remindAt" TIMESTAMPTZ NOT NULL,
    "note" TEXT,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reminders_sentAt_remindAt_idx" ON "reminders"("sentAt", "remindAt");
CREATE INDEX "reminders_workItemId_userId_idx" ON "reminders"("workItemId", "userId");

ALTER TABLE "reminders" ADD CONSTRAINT "reminders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
