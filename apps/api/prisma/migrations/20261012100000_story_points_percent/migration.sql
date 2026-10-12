-- Story Point her tipte, alt görev toplamı ve tamamlanma yüzdesi (ADR-107).
ALTER TABLE "work_items" ADD COLUMN "percentDone" INTEGER;
ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_percentDone_range" CHECK ("percentDone" IS NULL OR ("percentDone" >= 0 AND "percentDone" <= 100));

-- Sub-task'ı olan görevin puanı alt görevlerin toplamıdır. Hesap yazma anında veritabanında yapılır:
-- CSV/Excel içe aktarma, sürükle-bırak, silme ve geri alma gibi tüm yollar kendiliğinden tutarlı kalır.
-- Son Sub-task kalkınca üst görevde son toplam olduğu gibi kalır ve elle değiştirilebilir olur.
CREATE FUNCTION sync_subtask_points() RETURNS trigger AS $$
DECLARE
  affected UUID;
BEGIN
  FOR affected IN
    SELECT DISTINCT p
    FROM (VALUES
      (CASE WHEN TG_OP <> 'INSERT' AND OLD."type" = 'SUBTASK' THEN OLD."parentId" END),
      (CASE WHEN TG_OP <> 'DELETE' AND NEW."type" = 'SUBTASK' THEN NEW."parentId" END)
    ) AS v(p)
    WHERE p IS NOT NULL
  LOOP
    UPDATE "work_items" AS parent
    SET "points" = CASE WHEN s.counted > 0 THEN s.total END
    FROM (
      SELECT COUNT(*) AS members, COUNT("points") AS counted, SUM("points") AS total
      FROM "work_items"
      WHERE "parentId" = affected AND "type" = 'SUBTASK' AND "deletedAt" IS NULL
    ) AS s
    WHERE parent."id" = affected
      AND s.members > 0
      AND parent."points" IS DISTINCT FROM (CASE WHEN s.counted > 0 THEN s.total END);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "work_items_sync_subtask_points"
  AFTER INSERT OR DELETE OR UPDATE OF "points", "parentId", "type", "deletedAt" ON "work_items"
  FOR EACH ROW EXECUTE FUNCTION sync_subtask_points();
