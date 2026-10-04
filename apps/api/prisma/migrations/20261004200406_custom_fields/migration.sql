-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'DROPDOWN', 'MULTI_SELECT', 'PERSON', 'URL', 'CHECKBOX');

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "customFields" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "rank" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_fields_spaceId_idx" ON "custom_fields"("spaceId");

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sıralama anahtarları bayt sırasıyla karşılaştırılır (ADR-014).
ALTER TABLE "custom_fields" ALTER COLUMN "rank" TYPE TEXT COLLATE "C";

ALTER TABLE "work_items" ADD CONSTRAINT "work_items_customFields_object" CHECK (jsonb_typeof("customFields") = 'object');
