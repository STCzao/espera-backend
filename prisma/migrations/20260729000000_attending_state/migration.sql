-- Migration: attending_state
-- Adds ATTENDING status to TurnStatus enum and startedAttentionAt timestamp to turns.
-- Rollback:
--   ALTER TABLE turns DROP COLUMN started_attention_at;
--   ALTER TYPE "TurnStatus" RENAME TO "TurnStatus_old";
--   CREATE TYPE "TurnStatus" AS ENUM ('WAITING', 'CALLED', 'CANCELLED', 'COMPLETED');
--   ALTER TABLE turns ALTER COLUMN status TYPE "TurnStatus" USING status::text::"TurnStatus";
--   DROP TYPE "TurnStatus_old";

ALTER TYPE "TurnStatus" ADD VALUE 'ATTENDING' AFTER 'CALLED';

ALTER TABLE turns ADD COLUMN started_attention_at TIMESTAMP(3);
