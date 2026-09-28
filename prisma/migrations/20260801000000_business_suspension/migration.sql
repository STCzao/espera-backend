-- Migration: business_suspension
-- Adds audit fields for suspending/reactivating a Business (HU-8.4).
-- BusinessStatus.SUSPENDED already existed in the enum; this only adds the
-- who/when/why columns, same pattern as the approve/reject audit fields.
-- Rollback:
--   ALTER TABLE "businesses" DROP COLUMN "suspendedByUserId", DROP COLUMN "suspendedAt", DROP COLUMN "suspensionReason", DROP COLUMN "reactivatedByUserId", DROP COLUMN "reactivatedAt";

ALTER TABLE "businesses"
  ADD COLUMN "suspendedByUserId"   TEXT,
  ADD COLUMN "suspendedAt"         TIMESTAMP(3),
  ADD COLUMN "suspensionReason"    TEXT,
  ADD COLUMN "reactivatedByUserId" TEXT,
  ADD COLUMN "reactivatedAt"       TIMESTAMP(3);
