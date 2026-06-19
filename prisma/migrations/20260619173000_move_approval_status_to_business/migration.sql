ALTER TABLE "businesses"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "businesses" AS business
SET "approvalStatus" = owner."approvalStatus"
FROM "users" AS owner
WHERE business."ownerUserId" = owner."id";

ALTER TABLE "users"
DROP COLUMN "approvalStatus";
