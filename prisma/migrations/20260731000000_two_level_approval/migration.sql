-- Migration: two_level_approval
-- Introduces independent commercial approval at two levels: Organization
-- (approved once) and Business (approved independently per branch, no
-- longer a side effect of approving the owning User's account).
-- Rollback:
--   ALTER TABLE "businesses" DROP COLUMN "approvedByUserId", DROP COLUMN "approvedAt", DROP COLUMN "rejectedReason", DROP COLUMN "rejectedAt";
--   ALTER TABLE "organizations" DROP COLUMN "legalId", DROP COLUMN "status", DROP COLUMN "approvedByUserId", DROP COLUMN "approvedAt", DROP COLUMN "rejectedReason", DROP COLUMN "rejectedAt";
--   DROP TYPE "OrganizationStatus";

CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "organizations"
  ADD COLUMN "legalId"          TEXT,
  ADD COLUMN "status"           "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "approvedAt"       TIMESTAMP(3),
  ADD COLUMN "rejectedReason"   TEXT,
  ADD COLUMN "rejectedAt"       TIMESTAMP(3);

ALTER TABLE "businesses"
  ADD COLUMN "approvedByUserId" TEXT,
  ADD COLUMN "approvedAt"       TIMESTAMP(3),
  ADD COLUMN "rejectedReason"   TEXT,
  ADD COLUMN "rejectedAt"       TIMESTAMP(3);

-- Backfill: an Organization that already has at least one APPROVED Business
-- is grandfathered in as APPROVED — it was already operating before this
-- migration introduced the Organization-level gate. approvedByUserId/
-- approvedAt are left null since no specific admin action was recorded at
-- the time.
UPDATE "organizations"
SET "status" = 'APPROVED'
WHERE "id" IN (
  SELECT DISTINCT "organizationId" FROM "businesses" WHERE "status" = 'APPROVED'
);
