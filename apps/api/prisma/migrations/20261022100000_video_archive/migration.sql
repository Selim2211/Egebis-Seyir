-- Video arşivi (Faz 15, ADR-129): Proje başına klasörler ve parça parça yüklenen videolar.
-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'READY');

-- CreateTable
CREATE TABLE "video_folders" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "folderId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "received" BIGINT NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "uploadedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_folders_spaceId_parentId_idx" ON "video_folders"("spaceId", "parentId");

-- CreateIndex
CREATE INDEX "videos_spaceId_folderId_idx" ON "videos"("spaceId", "folderId");

-- AddForeignKey
ALTER TABLE "video_folders" ADD CONSTRAINT "video_folders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_folders" ADD CONSTRAINT "video_folders_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_folders" ADD CONSTRAINT "video_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "video_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "video_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

