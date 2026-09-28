-- Rollback (manual): to reverse this migration, run:
-- ALTER TABLE "businesses" ADD COLUMN "activeServiceWindows" INTEGER NOT NULL DEFAULT 1;

-- The legacy Business.activeServiceWindows counter (HU-2.3) is superseded by
-- real ServiceWindow rows, which every Queue is now guaranteed to have at
-- least one of (see ApproveBusinessUseCase/CreateQueueUseCase). No backfill
-- needed: no production data depends on this column (pre-launch).
ALTER TABLE "businesses"
DROP COLUMN "activeServiceWindows";
