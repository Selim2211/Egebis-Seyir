-- Uygulamadan girilen genel adres (ADR-122): sunucu başına tek satır.
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "publicUrl" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "app_settings_singleton" CHECK ("id" = 1)
);
