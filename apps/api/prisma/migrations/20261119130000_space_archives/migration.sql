-- ADR-176: arşivlenen Projenin içeriği sıkıştırılmış JSON olarak tek satırda saklanır.
CREATE TABLE "space_archives" (
    "spaceId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "rawBytes" INTEGER NOT NULL,
    "storedBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "space_archives_pkey" PRIMARY KEY ("spaceId")
);
CREATE INDEX "space_archives_workspaceId_idx" ON "space_archives"("workspaceId");
ALTER TABLE "space_archives" ADD CONSTRAINT "space_archives_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_archives" ADD CONSTRAINT "space_archives_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
