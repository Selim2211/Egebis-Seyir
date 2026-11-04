-- Proje bazında rol ayarı ve Story Point kilidi (ADR-161).
ALTER TABLE "spaces" ADD COLUMN "roleOverrides" JSONB;

-- Belirlenmiş Story Point'i değiştirme izni mevcut Proje Yöneticisi rollerine eklenir.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'estimate.override')
WHERE "scope" = 'SPACE' AND "key" = 'PROJECT_MANAGER' AND NOT ('estimate.override' = ANY("permissions"));
