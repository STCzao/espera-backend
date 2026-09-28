-- Migration: add_redirected_status
-- Adds REDIRECTED to TurnStatus enum. Used when a turn finishes its current
-- service window but must continue at another window (e.g. customer service
-- then cashier) instead of completing.
-- Rollback:
--   ALTER TYPE "TurnStatus" RENAME TO "TurnStatus_old";
--   CREATE TYPE "TurnStatus" AS ENUM ('WAITING', 'CALLED', 'ATTENDING', 'CANCELLED', 'COMPLETED');
--   ALTER TABLE "turns" ALTER COLUMN status TYPE "TurnStatus" USING status::text::"TurnStatus";
--   DROP TYPE "TurnStatus_old";

ALTER TYPE "TurnStatus" ADD VALUE 'REDIRECTED' AFTER 'ATTENDING';
