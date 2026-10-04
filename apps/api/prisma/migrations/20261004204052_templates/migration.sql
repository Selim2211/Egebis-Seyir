-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('ITEM', 'LIST', 'SPRINT', 'DOC', 'SPACE');

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_workspaceId_kind_idx" ON "templates"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "templates_spaceId_idx" ON "templates"("spaceId");

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "templates_space_kind_name_key" ON "templates"("workspaceId", COALESCE("spaceId", '00000000-0000-0000-0000-000000000000'::uuid), "kind", lower("name"));
