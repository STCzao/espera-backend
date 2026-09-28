-- Migration: add_user_unblock_audit
-- Adds audit fields for reversing a User block (HU-8.6 had block, never unblock).
-- Same pattern as businesses' suspendedByUserId/reactivatedByUserId pair.
-- Rollback:
--   ALTER TABLE "users" DROP COLUMN "unblockedByUserId", DROP COLUMN "unblockedAt";

ALTER TABLE "users"
  ADD COLUMN "unblockedByUserId" TEXT,
  ADD COLUMN "unblockedAt"       TIMESTAMP(3);
