-- Yapay zeka sağlayıcı adresi (ADR-141): boşsa TICKET_AI_URL (.env) kullanılır
ALTER TABLE "ticket_settings" ADD COLUMN "aiUrl" TEXT;
