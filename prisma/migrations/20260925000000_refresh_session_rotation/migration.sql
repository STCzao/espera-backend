-- Migration: refresh_session_rotation
-- RefreshTokenUseCase used to read a session and then overwrite its token
-- hash with no guard, so two concurrent refreshes with the same token (e.g.
-- two browser tabs) both succeeded and the loser was silently logged out
-- later; a rotated (stale) token was also indistinguishable from a random
-- guess, so a replayed stolen token was never detected. Rotation is now a
-- compare-and-swap on tokenHash, and the previous hash is kept so a reused
-- token can be told apart from an unknown one.
--
-- Additive and nullable: existing sessions keep working unchanged.
--
-- Rollback:
--   DROP INDEX "refresh_sessions_previousTokenHash_idx";
--   ALTER TABLE "refresh_sessions" DROP COLUMN "previousTokenHash", DROP COLUMN "rotatedAt";

ALTER TABLE "refresh_sessions"
  ADD COLUMN "previousTokenHash" TEXT,
  ADD COLUMN "rotatedAt" TIMESTAMP(3);

CREATE INDEX "refresh_sessions_previousTokenHash_idx" ON "refresh_sessions"("previousTokenHash");
