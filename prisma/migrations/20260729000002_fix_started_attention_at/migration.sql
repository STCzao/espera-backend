-- Migration: fix_started_attention_at
-- Renames started_attention_at to "startedAttentionAt" to match Prisma's expected column name.
-- The previous migration (20260729000000_attending_state) created the column without quotes,
-- resulting in snake_case which Prisma cannot resolve.

ALTER TABLE "turns" RENAME COLUMN "started_attention_at" TO "startedAttentionAt";
