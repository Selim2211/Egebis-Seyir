-- Global arama dizinleri (ADR-053). pg_trgm uzantısı ilk migration'da kuruldu.
-- Sorgu aynı ifadeyi kullanmalı: to_tsvector('turkish', title || ' ' || coalesce("descriptionText", '')).
CREATE INDEX "work_items_search_fts_idx" ON "work_items"
  USING GIN (to_tsvector('turkish', "title" || ' ' || coalesce("descriptionText", '')));

CREATE INDEX "work_items_title_trgm_idx" ON "work_items"
  USING GIN ("title" gin_trgm_ops);
