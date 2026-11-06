-- Mesajlara dosya eki.
CREATE TABLE "message_attachments" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_attachments_storageKey_key" ON "message_attachments"("storageKey");
CREATE INDEX "message_attachments_messageId_idx" ON "message_attachments"("messageId");
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
