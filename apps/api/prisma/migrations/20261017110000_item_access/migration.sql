-- Öğe bazlı erişim (ADR-113): özel erişim kayıtları + alt ağaç için denormalize kök.
ALTER TABLE "work_items" ADD COLUMN "accessRootId" UUID;
CREATE INDEX "work_items_workspaceId_accessRootId_idx" ON "work_items"("workspaceId", "accessRootId");

CREATE TABLE "work_item_access" (
  "itemId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_item_access_pkey" PRIMARY KEY ("itemId"),
  CONSTRAINT "work_item_access_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "work_item_access_entries" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "userId" UUID,
  "teamId" UUID,
  "roleId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_item_access_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_item_access_entries_who_check" CHECK (num_nonnulls("userId", "teamId") = 1),
  CONSTRAINT "work_item_access_entries_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "work_item_access"("itemId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "work_item_access_entries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "work_item_access_entries_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "work_item_access_entries_itemId_userId_key" ON "work_item_access_entries"("itemId", "userId");
CREATE UNIQUE INDEX "work_item_access_entries_itemId_teamId_key" ON "work_item_access_entries"("itemId", "teamId");
CREATE INDEX "work_item_access_entries_workspaceId_userId_idx" ON "work_item_access_entries"("workspaceId", "userId");
CREATE INDEX "work_item_access_entries_workspaceId_teamId_idx" ON "work_item_access_entries"("workspaceId", "teamId");

-- Bir öğenin ve alt ağacının erişim kökünü yeniden hesaplar.
CREATE OR REPLACE FUNCTION recompute_access_root(start_id UUID) RETURNS void AS $$
BEGIN
  WITH RECURSIVE tree AS (
    SELECT w."id",
           CASE WHEN a."itemId" IS NOT NULL THEN w."id" ELSE p."accessRootId" END AS root_id
    FROM "work_items" w
    LEFT JOIN "work_item_access" a ON a."itemId" = w."id"
    LEFT JOIN "work_items" p ON p."id" = w."parentId"
    WHERE w."id" = start_id
    UNION ALL
    SELECT c."id",
           CASE WHEN ca."itemId" IS NOT NULL THEN c."id" ELSE t.root_id END
    FROM "work_items" c
    JOIN tree t ON c."parentId" = t."id"
    LEFT JOIN "work_item_access" ca ON ca."itemId" = c."id"
  )
  UPDATE "work_items" w
  SET "accessRootId" = tree.root_id
  FROM tree
  WHERE w."id" = tree."id" AND w."accessRootId" IS DISTINCT FROM tree.root_id;
END;
$$ LANGUAGE plpgsql;

-- Yeni öğe üstünün erişim kökünü alır.
CREATE OR REPLACE FUNCTION work_items_access_root_insert() RETURNS trigger AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL THEN
    SELECT p."accessRootId" INTO NEW."accessRootId" FROM "work_items" p WHERE p."id" = NEW."parentId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER work_items_access_root_insert BEFORE INSERT ON "work_items"
FOR EACH ROW EXECUTE FUNCTION work_items_access_root_insert();

-- Üst öğe değişince (taşıma, Epic'e dönüştürme, alt görev yapma) kök yeniden hesaplanır.
CREATE OR REPLACE FUNCTION work_items_access_root_reparent() RETURNS trigger AS $$
BEGIN
  PERFORM recompute_access_root(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER work_items_access_root_reparent AFTER UPDATE OF "parentId" ON "work_items"
FOR EACH ROW WHEN (OLD."parentId" IS DISTINCT FROM NEW."parentId")
EXECUTE FUNCTION work_items_access_root_reparent();

-- Erişim kaydı eklenince/silinince alt ağaç yeniden hesaplanır.
CREATE OR REPLACE FUNCTION work_item_access_changed() RETURNS trigger AS $$
BEGIN
  PERFORM recompute_access_root(COALESCE(NEW."itemId", OLD."itemId"));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER work_item_access_changed AFTER INSERT OR DELETE ON "work_item_access"
FOR EACH ROW EXECUTE FUNCTION work_item_access_changed();

-- Yeni izin: öğe erişimini yönetme (Product Owner ve Scrum Master).
UPDATE "roles"
SET "permissions" = array_append("permissions", 'workItem.access.manage')
WHERE "scope" = 'SPACE'
  AND "key" IN ('PRODUCT_OWNER', 'SCRUM_MASTER')
  AND NOT ('workItem.access.manage' = ANY("permissions"));
