-- Migration: business_org_coherence
-- HU-8.7 — coherence alert when reviewing a Business against its
-- Organization. Adds Organization.categoryId (optional, same pattern as
-- legalId from HU-2.5.5 — opt-in at creation, editable later) so the
-- category-mismatch alert has something to compare against, plus the
-- audit fields that record the note and the alerts present when a Business
-- is approved despite them.
-- Rollback:
--   ALTER TABLE "businesses" DROP COLUMN "approvalNote", DROP COLUMN "approvalAlertsSnapshot";
--   ALTER TABLE "organizations" DROP COLUMN "categoryId";

ALTER TABLE "organizations"
  ADD COLUMN "categoryId" TEXT,
  ADD CONSTRAINT "organizations_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "business_categories"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "businesses"
  ADD COLUMN "approvalNote"           TEXT,
  ADD COLUMN "approvalAlertsSnapshot" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
