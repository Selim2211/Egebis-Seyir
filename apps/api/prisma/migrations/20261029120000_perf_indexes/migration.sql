-- Performans indeksleri: analiz, yönetici paneli, destek yanıt süreleri ve denetim günlüğü.
CREATE INDEX "activity_events_workspaceId_actorId_idx" ON "activity_events"("workspaceId", "actorId");
CREATE INDEX "work_items_workspaceId_completedAt_idx" ON "work_items"("workspaceId", "completedAt");
CREATE INDEX "work_items_workspaceId_type_createdAt_idx" ON "work_items"("workspaceId", "type", "createdAt");
CREATE INDEX "time_entries_workspaceId_day_idx" ON "time_entries"("workspaceId", "day");
CREATE INDEX "inbound_emails_workspaceId_kind_createdAt_idx" ON "inbound_emails"("workspaceId", "kind", "createdAt");
