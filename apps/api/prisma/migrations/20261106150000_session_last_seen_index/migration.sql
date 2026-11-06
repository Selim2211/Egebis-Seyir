-- Üye listesi: kişi başına en yeni oturum sorgusu hızlanır.
CREATE INDEX "sessions_userId_lastSeenAt_idx" ON "sessions"("userId", "lastSeenAt");
