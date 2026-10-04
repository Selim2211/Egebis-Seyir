-- AlterTable
ALTER TABLE "statuses" ADD COLUMN     "wip_limit" INTEGER;

ALTER TABLE "statuses" ADD CONSTRAINT "statuses_wip_limit_check" CHECK ("wip_limit" IS NULL OR ("wip_limit" > 0 AND "wip_limit" <= 999));
