-- Migration: membership_self_service
-- Membership had exactly one write path in the whole codebase (creating the
-- owner's initial admin Membership) and no way to invite a co-admin/employee
-- at the Organization level, list members, change a role, or revoke access —
-- mirrors the gap BusinessEmployee already solved at the Business level.
-- Adds audit fields to Membership (status/invitedByUserId/revokedAt, same
-- pattern as BusinessEmployee) and a new MembershipInvitation model (same
-- pattern as BusinessEmployeeInvitation).
-- Rollback:
--   DROP TABLE "membership_invitations";
--   DROP TYPE "MembershipInvitationStatus";
--   ALTER TABLE "memberships" DROP COLUMN "status", DROP COLUMN "invitedByUserId", DROP COLUMN "revokedAt";
--   DROP TYPE "MembershipStatus";

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "MembershipInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

ALTER TABLE "memberships"
  ADD COLUMN "status"          "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "invitedByUserId" TEXT,
  ADD COLUMN "revokedAt"       TIMESTAMP(3);

CREATE TABLE "membership_invitations" (
  "id"              TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "role"            "MembershipRole" NOT NULL,
  "token"           TEXT NOT NULL,
  "status"          "MembershipInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "invitedByUserId" TEXT NOT NULL,
  "acceptedUserId"  TEXT,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "acceptedAt"      TIMESTAMP(3),
  "revokedAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "membership_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "membership_invitations_token_key" ON "membership_invitations"("token");
CREATE INDEX "membership_invitations_organizationId_idx" ON "membership_invitations"("organizationId");

ALTER TABLE "membership_invitations"
  ADD CONSTRAINT "membership_invitations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
