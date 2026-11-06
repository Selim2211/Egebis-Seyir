-- Üye kilitleme: kilitli üye workspace'e erişemez, verisi silinmez.
ALTER TABLE "memberships" ADD COLUMN "lockedAt" TIMESTAMPTZ;
