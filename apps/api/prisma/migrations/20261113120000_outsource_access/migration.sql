-- Dış kaynak yetkisi Proje bazlı ve kişiye özel (ADR-172).
ALTER TABLE "space_members" ADD COLUMN "outsourceAccess" JSONB;

-- Mevcut dış kaynak üyeliklerine eski davranışa denk başlangıç yetkisi:
-- iş öğesi ve yorum yazma açık; doküman/video eski içerik erişimine göre (NONE/VIEW/FULL); raporlar okuma.
UPDATE "space_members" sm
SET "outsourceAccess" = jsonb_build_object(
  'items', 'WRITE',
  'comments', 'WRITE',
  'docs', CASE m."contentAccess" WHEN 'FULL' THEN 'WRITE' WHEN 'VIEW' THEN 'READ' ELSE 'NONE' END,
  'videos', CASE m."contentAccess" WHEN 'FULL' THEN 'WRITE' WHEN 'VIEW' THEN 'READ' ELSE 'NONE' END,
  'reports', 'READ'
)
FROM "memberships" m
JOIN "roles" r ON r."id" = m."roleId"
WHERE m."userId" = sm."userId" AND m."workspaceId" = sm."workspaceId"
  AND r."scope" = 'WORKSPACE' AND r."key" = 'GUEST';
