-- Proje bazında Product Owner / Scrum Master, gelen Bug e-posta gönderen listesi, askıdaki sprint.
ALTER TYPE "SprintStatus" ADD VALUE 'SUSPENDED';

ALTER TABLE "spaces"
  ADD COLUMN "productOwnerId" UUID,
  ADD COLUMN "scrumMasterId" UUID,
  ADD COLUMN "bugSenders" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_productOwnerId_fkey"
  FOREIGN KEY ("productOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_scrumMasterId_fkey"
  FOREIGN KEY ("scrumMasterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
