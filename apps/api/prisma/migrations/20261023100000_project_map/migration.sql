-- Proje Kuş Bakışı (ADR-136): kullanıcıya özel kutu konumları.
-- CreateTable
CREATE TABLE "map_layouts" (
    "userId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "positions" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "map_layouts_pkey" PRIMARY KEY ("userId","spaceId")
);

-- AddForeignKey
ALTER TABLE "map_layouts" ADD CONSTRAINT "map_layouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_layouts" ADD CONSTRAINT "map_layouts_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_layouts" ADD CONSTRAINT "map_layouts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
