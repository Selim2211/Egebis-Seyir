-- ADR-152: Proje rolleri ikiye iner (Proje Yöneticisi / Proje Üyesi), doküman ve video izinleri
-- ayrışır, dış kaynağın içerik erişimi eklenir. Proje görünürlüğü yalnızca üyelikle olur.

CREATE TYPE "ContentAccess" AS ENUM ('NONE', 'VIEW', 'FULL');
ALTER TABLE "memberships" ADD COLUMN "contentAccess" "ContentAccess" NOT NULL DEFAULT 'NONE';

-- 1) Sistem rolleri yeniden adlandırılır.
UPDATE "roles" SET "key" = 'PROJECT_MANAGER' WHERE "scope" = 'SPACE' AND "key" = 'PRODUCT_OWNER';
UPDATE "roles" SET "key" = 'PROJECT_MEMBER'  WHERE "scope" = 'SPACE' AND "key" = 'DEVELOPER';

-- 2) Scrum Master → Proje Yöneticisi, Stakeholder → Proje Üyesi (aynı workspace içinde).
UPDATE "space_members" sm SET "roleId" = pm."id"
FROM "roles" old, "roles" pm
WHERE sm."roleId" = old."id" AND old."scope" = 'SPACE' AND old."key" = 'SCRUM_MASTER'
  AND pm."workspaceId" = old."workspaceId" AND pm."scope" = 'SPACE' AND pm."key" = 'PROJECT_MANAGER';
UPDATE "space_members" sm SET "roleId" = mem."id"
FROM "roles" old, "roles" mem
WHERE sm."roleId" = old."id" AND old."scope" = 'SPACE' AND old."key" = 'STAKEHOLDER'
  AND mem."workspaceId" = old."workspaceId" AND mem."scope" = 'SPACE' AND mem."key" = 'PROJECT_MEMBER';
UPDATE "work_item_access_entries" e SET "roleId" = pm."id"
FROM "roles" old, "roles" pm
WHERE e."roleId" = old."id" AND old."scope" = 'SPACE' AND old."key" = 'SCRUM_MASTER'
  AND pm."workspaceId" = old."workspaceId" AND pm."scope" = 'SPACE' AND pm."key" = 'PROJECT_MANAGER';
UPDATE "work_item_access_entries" e SET "roleId" = mem."id"
FROM "roles" old, "roles" mem
WHERE e."roleId" = old."id" AND old."scope" = 'SPACE' AND old."key" = 'STAKEHOLDER'
  AND mem."workspaceId" = old."workspaceId" AND mem."scope" = 'SPACE' AND mem."key" = 'PROJECT_MEMBER';
DELETE FROM "roles" WHERE "scope" = 'SPACE' AND "isSystem" AND "key" IN ('SCRUM_MASTER', 'STAKEHOLDER');

-- 3) Sistem Proje rolleri yeni varsayılanları alır.
UPDATE "roles" SET "permissions" = ARRAY[
  'space.view','comment.write','report.view','bug.report','workItem.write','workItem.status.own',
  'estimate.write','space.lists.manage',
  'doc.view','doc.create','doc.edit','doc.delete','video.view','video.create','video.edit','video.delete',
  'space.settings','backlog.rank','sprint.plan','sprint.start','sprint.complete','sprint.cancel',
  'workItem.access.manage','bug.assign']
WHERE "scope" = 'SPACE' AND "isSystem" AND "key" = 'PROJECT_MANAGER';
UPDATE "roles" SET "permissions" = ARRAY[
  'space.view','comment.write','report.view','bug.report','workItem.write','workItem.status.own',
  'estimate.write','space.lists.manage',
  'doc.view','doc.create','doc.edit','doc.delete','video.view','video.create','video.edit','video.delete']
WHERE "scope" = 'SPACE' AND "isSystem" AND "key" = 'PROJECT_MEMBER';

-- 4) Özel rollerde eski izinler karşılıklarına açılır.
UPDATE "roles" SET "permissions" =
  array_remove("permissions", 'doc.write')
  || ARRAY['doc.create','doc.edit','doc.delete','video.create','video.edit','video.delete']
WHERE 'doc.write' = ANY("permissions");
UPDATE "roles" SET "permissions" = "permissions" || ARRAY['video.view']
WHERE 'doc.view' = ANY("permissions") AND NOT ('video.view' = ANY("permissions"));

-- 5) Açık Projeleri üyeliksiz kullanan kişiler erişimini kaybetmesin: bir öğede atanan ya da bildiren
--    olarak geçen Member katmanındaki kullanıcılar Proje Üyesi olarak eklenir.
INSERT INTO "space_members" ("id", "workspaceId", "spaceId", "userId", "roleId", "createdAt")
SELECT gen_random_uuid(), s."workspaceId", s."id", u."userId", mem."id", now()
FROM "spaces" s
JOIN "roles" mem ON mem."workspaceId" = s."workspaceId" AND mem."scope" = 'SPACE' AND mem."key" = 'PROJECT_MEMBER'
JOIN (
  SELECT wi."spaceId", a."userId" FROM "work_items" wi JOIN "work_item_assignees" a ON a."workItemId" = wi."id"
  UNION SELECT "spaceId", "reporterId" FROM "work_items" WHERE "reporterId" IS NOT NULL
) u ON u."spaceId" = s."id"
JOIN "memberships" m ON m."workspaceId" = s."workspaceId" AND m."userId" = u."userId"
JOIN "roles" wr ON wr."id" = m."roleId" AND COALESCE(wr."baseKey", wr."key") = 'MEMBER'
WHERE NOT s."isPrivate" AND s."deletedAt" IS NULL
ON CONFLICT ("spaceId", "userId") DO NOTHING;
