-- Çağrı sistemi (ADR-138): e-postadan Bug, Bug→Task kaynağı, gelen kutusu Projesi.
-- CreateEnum
CREATE TYPE "InboundEmailKind" AS ENUM ('NEW', 'REPLY');

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "ticketsSince" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "ticketInbox" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "sourceBugId" UUID;

-- CreateTable
CREATE TABLE "inbound_emails" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "kind" "InboundEmailKind" NOT NULL,
    "messageId" TEXT NOT NULL,
    "ackMessageId" TEXT,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_emails_workItemId_idx" ON "inbound_emails"("workItemId");

-- CreateIndex
CREATE INDEX "inbound_emails_fromEmail_createdAt_idx" ON "inbound_emails"("fromEmail", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_emails_workspaceId_messageId_key" ON "inbound_emails"("workspaceId", "messageId");

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_sourceBugId_fkey" FOREIGN KEY ("sourceBugId") REFERENCES "work_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "work_items_sourceBugId_idx" ON "work_items"("sourceBugId");

-- Workspace başına tek çağrı gelen kutusu Projesi
CREATE UNIQUE INDEX "spaces_ticket_inbox_key" ON "spaces"("workspaceId") WHERE "ticketInbox";
