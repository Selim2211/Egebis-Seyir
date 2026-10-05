-- CreateEnum
CREATE TYPE "GitProvider" AS ENUM ('GITHUB', 'GITLAB');

-- CreateEnum
CREATE TYPE "GitLinkKind" AS ENUM ('COMMIT', 'PULL_REQUEST');

-- CreateEnum
CREATE TYPE "GitLinkState" AS ENUM ('OPEN', 'MERGED', 'CLOSED');

-- CreateTable
CREATE TABLE "git_integrations" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "GitProvider" NOT NULL,
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastEventAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "git_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_links" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "workItemId" UUID NOT NULL,
    "provider" "GitProvider" NOT NULL,
    "kind" "GitLinkKind" NOT NULL,
    "repo" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "state" "GitLinkState",
    "author" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "git_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "git_integrations_workspaceId_idx" ON "git_integrations"("workspaceId");

-- CreateIndex
CREATE INDEX "git_links_workItemId_idx" ON "git_links"("workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "git_links_workItemId_provider_kind_repo_externalId_key" ON "git_links"("workItemId", "provider", "kind", "repo", "externalId");

-- AddForeignKey
ALTER TABLE "git_integrations" ADD CONSTRAINT "git_integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_links" ADD CONSTRAINT "git_links_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_links" ADD CONSTRAINT "git_links_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
