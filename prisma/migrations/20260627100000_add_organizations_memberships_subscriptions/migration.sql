-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'EMPLOYEE');
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO', 'PREMIUM');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'BASIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
ADD CONSTRAINT "memberships_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
ADD CONSTRAINT "memberships_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (nullable first so existing rows can be backfilled below)
ALTER TABLE "businesses" ADD COLUMN "organizationId" TEXT;

-- Backfill: one Organization (+ BASIC Subscription) per existing Business (HU-2.5.1).
-- This keeps the 1:1:1 shape for accounts that predate Organization, exactly
-- as Épica 2.5 documents it: no existing Business loses data or access.
-- The Organization reuses the Business id as its own id: "organizations" is
-- brand new and empty, so there is no collision risk, and it sidesteps having
-- to match rows back up by non-unique columns like "name".
INSERT INTO "organizations" ("id", "name", "createdAt", "updatedAt")
SELECT "id", "name", "createdAt", "updatedAt"
FROM "businesses";

UPDATE "businesses"
SET "organizationId" = "id";

INSERT INTO "subscriptions" ("id", "organizationId", "plan", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."organizationId", 'BASIC', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "businesses" b;

-- Backfill ADMIN membership for each Business owner (HU-2.5.2).
INSERT INTO "memberships" ("id", "userId", "organizationId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."ownerUserId", b."organizationId", 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "businesses" b
ON CONFLICT ("userId", "organizationId") DO NOTHING;

-- Backfill EMPLOYEE membership for each active business employee (HU-2.5.2).
INSERT INTO "memberships" ("id", "userId", "organizationId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid(), be."userId", b."organizationId", 'EMPLOYEE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "business_employees" be
JOIN "businesses" b ON b."id" = be."businessId"
WHERE be."status" = 'ACTIVE'
ON CONFLICT ("userId", "organizationId") DO NOTHING;

-- Now that every row has an Organization, enforce the FK (HU-2.5.1).
ALTER TABLE "businesses" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX "businesses_organizationId_idx" ON "businesses"("organizationId");

ALTER TABLE "businesses"
ADD CONSTRAINT "businesses_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Manual rollback (HU-2.5.1 AC: migration must be reversible). This repo does
-- not generate down-migrations automatically, so revert by hand if needed:
--
-- ALTER TABLE "businesses" DROP CONSTRAINT "businesses_organizationId_fkey";
-- DROP INDEX "businesses_organizationId_idx";
-- ALTER TABLE "businesses" DROP COLUMN "organizationId";
-- DROP TABLE "memberships";
-- DROP TABLE "subscriptions";
-- DROP TABLE "organizations";
-- DROP TYPE "SubscriptionPlan";
-- DROP TYPE "MembershipRole";
