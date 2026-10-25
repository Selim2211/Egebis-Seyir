-- Yapay zeka destekli çağrı yönlendirme (ADR-141)
ALTER TABLE "ticket_settings" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiModel" TEXT NOT NULL DEFAULT 'nvidia/nemotron-3-ultra-550b-a55b',
ADD COLUMN "aiKeyEnc" TEXT;

ALTER TABLE "inbound_emails" ADD COLUMN "aiSummary" TEXT;
