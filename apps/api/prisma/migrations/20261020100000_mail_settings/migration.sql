-- Uygulama içi SMTP ayarı (ADR-120): sunucu başına tek satır.
CREATE TABLE "mail_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "passwordEnc" TEXT,
    "fromAddress" TEXT NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mail_settings_singleton" CHECK ("id" = 1)
);
