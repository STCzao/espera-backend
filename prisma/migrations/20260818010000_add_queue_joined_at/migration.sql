-- Migration: add_queue_joined_at
-- Separates "when this turn was recorded" (createdAt, plain audit) from
-- "when it starts counting for queue position/wait display" (queueJoinedAt).
-- A phone reservation taken well ahead of the customer's actual arrival
-- (HU-4.5) would otherwise unfairly outrank people who register live in
-- between — queueJoinedAt = createdAt + declared ETA fixes that. Backfilled
-- with createdAt for any pre-existing row (equivalent to "no delay").
-- Rollback:
--   ALTER TABLE "turns" DROP COLUMN "queueJoinedAt";

ALTER TABLE "turns"
ADD COLUMN "queueJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT now();

UPDATE "turns" SET "queueJoinedAt" = "createdAt";
