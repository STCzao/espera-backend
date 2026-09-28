-- Migration: add_turn_no_show_status
-- CallNextUseCase used to force a stale "called" turn (called, never
-- confirmed as attending) straight to "completed" when staff called the
-- next one — recording a no-show as if the person had actually been
-- attended. No status existed to represent "called, skipped, never
-- attended" as distinct from a real completion or a proactive cancellation.
-- Rollback:
--   ALTER TABLE "turns" DROP COLUMN "noShowAt";
--   -- TurnStatus enum values cannot be dropped in Postgres without
--   -- recreating the type; not attempted here.

ALTER TYPE "TurnStatus" ADD VALUE 'NO_SHOW';
ALTER TABLE "turns" ADD COLUMN "noShowAt" TIMESTAMP(3);
