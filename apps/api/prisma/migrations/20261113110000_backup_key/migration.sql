-- Yedek şifreleme anahtarı (ADR-171): AES-256; anahtar sunucu sırrıyla mühürlenerek saklanır.
ALTER TABLE "workspaces" ADD COLUMN "backupKeySealed" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "backupKeyFingerprint" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "backupKeyUpdatedAt" TIMESTAMPTZ;
