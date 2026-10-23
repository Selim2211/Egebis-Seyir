-- Çağrı gelen kutusu (ADR-138): okundu bayrağı yerine UID imleci (self-gönderilen ve webmail'de açılan e-postalar kaçmaz).
ALTER TABLE "app_settings" DROP COLUMN "ticketsSince";
ALTER TABLE "app_settings" ADD COLUMN "ticketsLastUid" INTEGER;
ALTER TABLE "app_settings" ADD COLUMN "ticketsUidValidity" BIGINT;
