-- Çağrı sistemi (ADR-138): Gönderilmiş Öğeler klasörü okunur, destek yanıtları yazışmaya düşer.
ALTER TYPE "InboundEmailKind" ADD VALUE 'OUTBOUND';
ALTER TABLE "app_settings" ADD COLUMN "ticketsSentUid" INTEGER;
ALTER TABLE "app_settings" ADD COLUMN "ticketsSentValidity" BIGINT;
