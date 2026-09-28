-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterTable: businesses
ALTER TABLE "businesses" ADD COLUMN "status" "BusinessStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: align Business.status with the owner's current approvalStatus.
-- Existing approved business_admin owners get their businesses marked APPROVED.
-- Rejected owners get REJECTED. Everything else stays PENDING.
UPDATE "businesses" b
SET "status" = CASE
    WHEN u."approvalStatus" = 'APPROVED' THEN 'APPROVED'::"BusinessStatus"
    WHEN u."approvalStatus" = 'REJECTED' THEN 'REJECTED'::"BusinessStatus"
    ELSE 'PENDING'::"BusinessStatus"
END
FROM "users" u
WHERE b."ownerUserId" = u."id";

-- AlterTable: subscriptions
ALTER TABLE "subscriptions"
    ADD COLUMN "status"             "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "trialEndsAt"        TIMESTAMP(3),
    ADD COLUMN "cancellationReason" TEXT,
    ADD COLUMN "cancelledAt"        TIMESTAMP(3);

-- Backfill: subscriptions created by the E2.5 migration backfill represent
-- real (pre-existing) businesses that were already operating, so they start
-- as ACTIVE rather than PENDING or TRIAL.
UPDATE "subscriptions" s
SET "status" = 'ACTIVE'::"SubscriptionStatus"
FROM "organizations" o
JOIN "businesses" b ON b."organizationId" = o."id"
WHERE s."organizationId" = o."id"
  AND b."status" = 'APPROVED'::"BusinessStatus";

-- Manual rollback:
-- ALTER TABLE "subscriptions" DROP COLUMN "cancelledAt", DROP COLUMN "cancellationReason", DROP COLUMN "trialEndsAt", DROP COLUMN "status";
-- ALTER TABLE "businesses" DROP COLUMN "status";
-- DROP TYPE "SubscriptionStatus";
-- DROP TYPE "BusinessStatus";
