-- Kişi/ekip başına doküman ve video yükleme sınırı (ADR-154).
CREATE TABLE "upload_quotas" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID,
    "teamId" UUID,
    "maxFiles" INTEGER,
    "maxMb" INTEGER,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "upload_quotas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "upload_quotas_target_check" CHECK (("userId" IS NULL) <> ("teamId" IS NULL))
);

CREATE UNIQUE INDEX "upload_quotas_teamId_key" ON "upload_quotas"("teamId");
CREATE UNIQUE INDEX "upload_quotas_workspaceId_userId_key" ON "upload_quotas"("workspaceId", "userId");

ALTER TABLE "upload_quotas" ADD CONSTRAINT "upload_quotas_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_quotas" ADD CONSTRAINT "upload_quotas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_quotas" ADD CONSTRAINT "upload_quotas_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
