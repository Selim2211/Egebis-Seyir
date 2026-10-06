-- Doküman sayfası ekleri (Faz 7.5): ek ya bir göreve ya da bir sayfaya aittir.
ALTER TABLE "attachments" ADD COLUMN     "docId" UUID,
ALTER COLUMN "workItemId" DROP NOT NULL;

CREATE INDEX "attachments_docId_idx" ON "attachments"("docId");

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_docId_fkey" FOREIGN KEY ("docId") REFERENCES "docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_target_check"
  CHECK (("workItemId" IS NOT NULL) <> ("docId" IS NOT NULL));
