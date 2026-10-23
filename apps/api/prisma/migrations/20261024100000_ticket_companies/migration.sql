-- Çağrı sistemi (ADR-140): firmalar/domainler, yönlendirme kuralları, e-posta ayarları, atama günlüğü, süreç yanıtları.

-- AlterTable
ALTER TABLE "inbound_emails" ADD COLUMN     "companyId" UUID,
ADD COLUMN     "processingMailAt" TIMESTAMPTZ,
ADD COLUMN     "resolvedMailAt" TIMESTAMPTZ,
ADD COLUMN     "rootCompanyId" UUID,
ADD COLUMN     "routeReason" TEXT,
ADD COLUMN     "routedSpaceId" UUID,
ADD COLUMN     "routedSpaceName" TEXT;

-- CreateTable
CREATE TABLE "ticket_settings" (
    "workspaceId" UUID NOT NULL,
    "imapHost" TEXT,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT,
    "passwordEnc" TEXT,
    "address" TEXT,
    "fromName" TEXT NOT NULL DEFAULT 'Egebis Destek',
    "pollSeconds" INTEGER NOT NULL DEFAULT 60,
    "autoReply" BOOLEAN NOT NULL DEFAULT true,
    "orgName" TEXT,
    "orgPhone" TEXT,
    "orgWebsite" TEXT,
    "orgSignature" TEXT,
    "templates" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ticket_settings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "ticket_companies" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "defaultSpaceId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_company_domains" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "domain" TEXT NOT NULL,

    CONSTRAINT "ticket_company_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_rules" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "companyId" UUID,
    "keyword" TEXT NOT NULL,
    "spaceId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_companies_workspaceId_name_key" ON "ticket_companies"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ticket_company_domains_companyId_idx" ON "ticket_company_domains"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_company_domains_workspaceId_domain_key" ON "ticket_company_domains"("workspaceId", "domain");

-- CreateIndex
CREATE INDEX "ticket_rules_workspaceId_position_idx" ON "ticket_rules"("workspaceId", "position");

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ticket_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_rootCompanyId_fkey" FOREIGN KEY ("rootCompanyId") REFERENCES "ticket_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_settings" ADD CONSTRAINT "ticket_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_companies" ADD CONSTRAINT "ticket_companies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_companies" ADD CONSTRAINT "ticket_companies_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ticket_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_companies" ADD CONSTRAINT "ticket_companies_defaultSpaceId_fkey" FOREIGN KEY ("defaultSpaceId") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_company_domains" ADD CONSTRAINT "ticket_company_domains_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_company_domains" ADD CONSTRAINT "ticket_company_domains_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ticket_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_rules" ADD CONSTRAINT "ticket_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_rules" ADD CONSTRAINT "ticket_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ticket_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_rules" ADD CONSTRAINT "ticket_rules_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

