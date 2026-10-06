-- Doküman arama dizinleri (Faz 7.5). Sorgu aynı ifadeyi kullanmalı:
-- to_tsvector('turkish', title || ' ' || plainText).
CREATE INDEX "docs_search_fts_idx" ON "docs"
  USING GIN (to_tsvector('turkish', "title" || ' ' || "plainText"));

CREATE INDEX "docs_title_trgm_idx" ON "docs"
  USING GIN ("title" gin_trgm_ops);
