-- Bug iş akışı (ADR-117).
CREATE TYPE "BugStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED');
ALTER TABLE "work_items" ADD COLUMN "bugStatus" "BugStatus";

-- Mevcut Bug'lar: durum kategorisi ve atanana göre.
UPDATE "work_items" w
SET "bugStatus" = CASE
  WHEN s."category" = 'DONE' THEN 'RESOLVED'::"BugStatus"
  WHEN s."category" = 'ACTIVE' THEN 'IN_PROGRESS'::"BugStatus"
  WHEN EXISTS (SELECT 1 FROM "work_item_assignees" a WHERE a."workItemId" = w."id") THEN 'ASSIGNED'::"BugStatus"
  ELSE 'UNASSIGNED'::"BugStatus"
END
FROM "statuses" s
WHERE s."id" = w."statusId" AND w."type" = 'BUG';

-- Yeni izinler: Bug açma (tüm Space rolleri) ve Bug atama (Product Owner, Scrum Master).
UPDATE "roles" SET "permissions" = array_append("permissions", 'bug.report')
WHERE "scope" = 'SPACE' AND "key" IN ('PRODUCT_OWNER', 'SCRUM_MASTER', 'DEVELOPER', 'STAKEHOLDER')
  AND NOT ('bug.report' = ANY("permissions"));
UPDATE "roles" SET "permissions" = array_append("permissions", 'bug.assign')
WHERE "scope" = 'SPACE' AND "key" IN ('PRODUCT_OWNER', 'SCRUM_MASTER')
  AND NOT ('bug.assign' = ANY("permissions"));
