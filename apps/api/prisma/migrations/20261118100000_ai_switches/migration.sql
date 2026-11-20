-- Yapay zekâ ana anahtarı ve sprint hedefi AI anahtarı (ADR-175).
ALTER TABLE "workspaces" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "workspaces" ADD COLUMN "aiSprintGoalEnabled" BOOLEAN NOT NULL DEFAULT true;
