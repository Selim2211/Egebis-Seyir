-- Formlar (Faz 7.4): Space üyelerinin bir List'e görev açması.
CREATE TABLE "forms" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "WorkItemType" NOT NULL DEFAULT 'TASK',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "forms_spaceId_idx" ON "forms"("spaceId");

ALTER TABLE "forms" ADD CONSTRAINT "forms_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forms" ADD CONSTRAINT "forms_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "forms" ADD CONSTRAINT "forms_listId_fkey" FOREIGN KEY ("listId") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
