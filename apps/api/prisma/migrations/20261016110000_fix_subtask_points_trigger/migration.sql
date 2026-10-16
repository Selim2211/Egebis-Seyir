-- Düzeltme (ADR-107): Sub-Task'ların hiçbirinde puan yokken üst Task'ın kendi puanı silinmemeli.
-- Önceki sürüm, alt görev varken (puansız olsa bile) üst puanı NULL'a çekiyordu.
CREATE OR REPLACE FUNCTION sync_subtask_points() RETURNS trigger AS $$
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
    SET "points" = s.total
    FROM (
      SELECT COUNT("points") AS counted, SUM("points") AS total
      FROM "work_items"
      WHERE "parentId" = affected AND "type" = 'SUBTASK' AND "deletedAt" IS NULL
    ) AS s
    WHERE parent."id" = affected
      AND s.counted > 0
      AND parent."points" IS DISTINCT FROM s.total;
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
