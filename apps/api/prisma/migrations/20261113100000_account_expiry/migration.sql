-- Süreli hesaplar (ADR-169): Dış kaynak (GUEST) 90 gün, Guest (VIEWER) 30 gün; süre bitince kilitlenir.
ALTER TABLE "memberships" ADD COLUMN "expiresAt" TIMESTAMPTZ;

-- Her workspace'e yeni sistem rolü: VIEWER (Guest, yalnızca okur).
INSERT INTO "roles" ("id", "workspaceId", "scope", "key", "permissions", "isSystem", "createdAt")
SELECT gen_random_uuid(), w."id", 'WORKSPACE', 'VIEWER', ARRAY[]::text[], true, now()
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "roles" r WHERE r."workspaceId" = w."id" AND r."scope" = 'WORKSPACE' AND r."key" = 'VIEWER'
);

-- Mevcut Dış kaynak hesaplarına bugünden 90 gün.
UPDATE "memberships" m
SET "expiresAt" = now() + interval '90 days'
FROM "roles" r
WHERE m."roleId" = r."id" AND r."scope" = 'WORKSPACE' AND r."key" = 'GUEST';
