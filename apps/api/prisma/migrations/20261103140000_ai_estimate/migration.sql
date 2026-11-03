-- AI ile Story Point önerisi ayarları (ADR-155).
ALTER TABLE "workspaces" ADD COLUMN "aiEstimateEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workspaces" ADD COLUMN "aiEstimateMinSentences" INTEGER NOT NULL DEFAULT 5;
