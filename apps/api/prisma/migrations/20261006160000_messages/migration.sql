-- Birebir mesajlaşma (Faz 7.8).
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userLowId" UUID NOT NULL,
    "userHighId" UUID NOT NULL,
    "lastReadLowAt" TIMESTAMPTZ,
    "lastReadHighAt" TIMESTAMPTZ,
    "lastMessageAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_order_check" CHECK ("userLowId" < "userHighId")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_workspaceId_userLowId_userHighId_key" ON "conversations"("workspaceId", "userLowId", "userHighId");
CREATE INDEX "conversations_userLowId_idx" ON "conversations"("userLowId");
CREATE INDEX "conversations_userHighId_idx" ON "conversations"("userHighId");
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
