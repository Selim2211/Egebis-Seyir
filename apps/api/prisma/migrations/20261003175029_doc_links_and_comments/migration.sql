-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "docId" UUID,
ALTER COLUMN "workItemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "doc_item_links" (
    "workspaceId" UUID NOT NULL,
    "docId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_item_links_pkey" PRIMARY KEY ("docId","workItemId")
);

-- CreateIndex
CREATE INDEX "doc_item_links_workItemId_idx" ON "doc_item_links"("workItemId");

-- CreateIndex
CREATE INDEX "comments_docId_createdAt_idx" ON "comments"("docId", "createdAt");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_docId_fkey" FOREIGN KEY ("docId") REFERENCES "docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_item_links" ADD CONSTRAINT "doc_item_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_item_links" ADD CONSTRAINT "doc_item_links_docId_fkey" FOREIGN KEY ("docId") REFERENCES "docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_item_links" ADD CONSTRAINT "doc_item_links_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Yorum ya bir göreve ya da bir doküman sayfasına aittir (ADR-070).
ALTER TABLE "comments" ADD CONSTRAINT "comments_target_check"
  CHECK (("workItemId" IS NOT NULL) <> ("docId" IS NOT NULL));
