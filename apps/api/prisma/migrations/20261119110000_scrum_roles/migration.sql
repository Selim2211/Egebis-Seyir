-- ADR-176: Proje rolleri Scrum Master (PROJECT_MANAGER), Product Owner (PRODUCT_OWNER) ve Team Member
-- (PROJECT_MEMBER) olur. Bir Projede en çok bir Scrum Master ve bir Product Owner bulunur; ikisi
-- spaces.scrumMasterId / productOwnerId alanlarıyla eşit tutulur.

-- 1) Her workspace'e Product Owner sistem rolü: Team Member izinleri + Backlog önceliği.
INSERT INTO "roles" ("id", "workspaceId", "scope", "key", "permissions", "isSystem", "createdAt")
SELECT gen_random_uuid(), m."workspaceId", m."scope", 'PRODUCT_OWNER',
       array_append(array_remove(m."permissions", 'backlog.rank'), 'backlog.rank'), true, now()
FROM "roles" m
WHERE m."scope" = 'SPACE' AND m."key" = 'PROJECT_MEMBER'
ON CONFLICT ("workspaceId", "scope", "key") DO NOTHING;

-- 2) Scrum Master'ı olmayan Projede en eski Proje Yöneticisi Scrum Master olur.
UPDATE "spaces" s SET "scrumMasterId" = (
  SELECT sm."userId" FROM "space_members" sm JOIN "roles" r ON r."id" = sm."roleId"
  WHERE sm."spaceId" = s."id" AND r."key" = 'PROJECT_MANAGER'
  ORDER BY sm."createdAt", sm."id" LIMIT 1)
WHERE s."scrumMasterId" IS NULL;

-- 3) Aynı kişi hem SM hem PO ise SM kalır.
UPDATE "spaces" SET "productOwnerId" = NULL WHERE "productOwnerId" = "scrumMasterId";

-- 4) Üyelik rolleri alanlarla eşitlenir.
UPDATE "space_members" sm SET "roleId" = pm."id"
FROM "spaces" s, "roles" pm
WHERE sm."spaceId" = s."id" AND sm."userId" = s."scrumMasterId"
  AND pm."workspaceId" = s."workspaceId" AND pm."scope" = 'SPACE' AND pm."key" = 'PROJECT_MANAGER';
UPDATE "space_members" sm SET "roleId" = po."id"
FROM "spaces" s, "roles" po
WHERE sm."spaceId" = s."id" AND sm."userId" = s."productOwnerId"
  AND po."workspaceId" = s."workspaceId" AND po."scope" = 'SPACE' AND po."key" = 'PRODUCT_OWNER';

-- 5) Scrum Master olmayan diğer Proje Yöneticileri Team Member olur.
UPDATE "space_members" sm SET "roleId" = mem."id"
FROM "spaces" s, "roles" cur, "roles" mem
WHERE sm."spaceId" = s."id" AND cur."id" = sm."roleId" AND cur."key" = 'PROJECT_MANAGER'
  AND sm."userId" IS DISTINCT FROM s."scrumMasterId"
  AND mem."workspaceId" = s."workspaceId" AND mem."scope" = 'SPACE' AND mem."key" = 'PROJECT_MEMBER';
