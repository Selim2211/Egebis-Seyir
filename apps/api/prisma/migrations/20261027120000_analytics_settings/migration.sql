-- Analiz modülü ayarları: haftalık özet e-postası (ADR-149)
CREATE TABLE "analytics_settings" (
    "workspaceId" UUID NOT NULL,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestLastWeek" DATE,
    "digestLastSentAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "analytics_settings_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "analytics_settings" ADD CONSTRAINT "analytics_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
