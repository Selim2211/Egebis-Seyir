-- Story tipi kaldırıldı (ADR-110): hiyerarşi Epic > Task > Sub-Task. Mevcut veri dönüştürülür.

-- 1) Story'nin altındaki Task'ların Sub-Task'ları (üçüncü seviye) doğrudan Story'ye (yeni Task'a) bağlanır;
--    Sub-Task'ın altında Sub-Task olamaz.
UPDATE "work_items" AS sub
SET "parentId" = task."parentId"
FROM "work_items" AS task
JOIN "work_items" AS story ON story."id" = task."parentId"
WHERE sub."parentId" = task."id"
  AND sub."type" = 'SUBTASK'
  AND task."type" = 'TASK'
  AND story."type" = 'STORY';

-- 2) Story'nin altındaki Task'lar Sub-Task olur.
UPDATE "work_items" SET "type" = 'SUBTASK'
WHERE "type" = 'TASK'
  AND "parentId" IN (SELECT "id" FROM "work_items" WHERE "type" = 'STORY');

-- 3) Story'ler Task olur; formlar ve kayıtlı JSON (görünüm, şablon, otomasyon) da aynı şekilde.
UPDATE "work_items" SET "type" = 'TASK' WHERE "type" = 'STORY';
UPDATE "forms" SET "itemType" = 'TASK' WHERE "itemType" = 'STORY';
UPDATE "saved_views" SET "config" = replace("config"::text, '"STORY"', '"TASK"')::jsonb
  WHERE "config"::text LIKE '%"STORY"%';
UPDATE "templates" SET "payload" = replace("payload"::text, '"STORY"', '"TASK"')::jsonb
  WHERE "payload"::text LIKE '%"STORY"%';
UPDATE "automations" SET
  "trigger" = replace("trigger"::text, '"STORY"', '"TASK"')::jsonb,
  "conditions" = replace("conditions"::text, '"STORY"', '"TASK"')::jsonb,
  "actions" = replace("actions"::text, '"STORY"', '"TASK"')::jsonb
  WHERE "trigger"::text LIKE '%"STORY"%' OR "conditions"::text LIKE '%"STORY"%' OR "actions"::text LIKE '%"STORY"%';

-- 4) Enum'dan STORY değeri çıkarılır (PostgreSQL değer silemez; tür yeniden oluşturulur).
--    Sütunu kullanan tetikleyici tür değişimi için önce kaldırılır, sonra aynen geri konur.
DROP TRIGGER "work_items_sync_subtask_points" ON "work_items";
ALTER TABLE "forms" ALTER COLUMN "itemType" DROP DEFAULT;
ALTER TYPE "WorkItemType" RENAME TO "WorkItemType_old";
CREATE TYPE "WorkItemType" AS ENUM ('EPIC', 'TASK', 'SUBTASK', 'BUG');
ALTER TABLE "work_items" ALTER COLUMN "type" TYPE "WorkItemType" USING "type"::text::"WorkItemType";
ALTER TABLE "forms" ALTER COLUMN "itemType" TYPE "WorkItemType" USING "itemType"::text::"WorkItemType";
ALTER TABLE "forms" ALTER COLUMN "itemType" SET DEFAULT 'TASK';
DROP TYPE "WorkItemType_old";
CREATE TRIGGER "work_items_sync_subtask_points"
  AFTER INSERT OR DELETE OR UPDATE OF "points", "parentId", "type", "deletedAt" ON "work_items"
  FOR EACH ROW EXECUTE FUNCTION sync_subtask_points();
