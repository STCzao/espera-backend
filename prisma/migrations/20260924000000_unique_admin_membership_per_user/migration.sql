-- Migration: unique_admin_membership_per_user
-- CreateOrganizationForOwnerUseCase's "does this owner already have an
-- ADMIN membership" check is a read followed by a separate write, so two
-- concurrent first registrations for the same owner (double submit, two
-- tabs) can both read "none" and each create their own Organization +
-- Subscription + ADMIN Membership — two duplicate organizations, and the
-- owner would then be an admin of both. An owner is the ADMIN of exactly
-- one Organization (CreateOrganizationForOwnerUseCase is the only place an
-- ADMIN membership is ever created); a partial unique index makes the
-- database reject the second one, same pattern as
-- 20260918000000_unique_active_qr_per_business.
--
-- WARNING: this fails to apply if production data already contains a user
-- with more than one ADMIN membership. Check first with:
--   SELECT "userId", COUNT(*) FROM "memberships"
--   WHERE "role" = 'ADMIN' GROUP BY "userId" HAVING COUNT(*) > 1;
--
-- Rollback:
--   DROP INDEX "memberships_admin_per_user_unique";

CREATE UNIQUE INDEX "memberships_admin_per_user_unique"
ON "memberships" ("userId")
WHERE "role" = 'ADMIN';
