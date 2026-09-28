-- CreateIndex
CREATE INDEX "businesses_ownerUserId_idx" ON "businesses"("ownerUserId");

-- CreateIndex
CREATE INDEX "turns_queueId_turnDate_idx" ON "turns"("queueId", "turnDate");

-- CreateIndex
CREATE INDEX "turns_queueId_calledAt_idx" ON "turns"("queueId", "calledAt");
