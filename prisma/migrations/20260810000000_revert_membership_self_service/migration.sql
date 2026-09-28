-- Migration: revert_membership_self_service
-- Reverts 20260809000000_membership_self_service. Product decision: an
-- Organization has exactly one admin (whoever created it) for this MVP
-- phase — delegating work happens per-Business via the already-working
-- BusinessEmployee invite flow, not via Organization-level Membership
-- self-service. The self-service layer (invite/accept/list/revoke/change
-- role) doesn't serve a real need under that design and duplicated
-- BusinessEmployee's job without being properly wired to real RBAC
-- permissions (AcceptMembershipInvitationUseCase never promoted User.role,
-- so an invited "admin" could never actually reach any
-- organization:edit-gated endpoint).
-- Rollback of this rollback (i.e. reapplying the feature) would mean
-- restoring migration 20260809000000_membership_self_service's SQL.

DROP TABLE "membership_invitations";
DROP TYPE "MembershipInvitationStatus";

ALTER TABLE "memberships"
  DROP COLUMN "status",
  DROP COLUMN "invitedByUserId",
  DROP COLUMN "revokedAt";

DROP TYPE "MembershipStatus";
