import type { MembershipRole } from "./Membership";

export type MembershipInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/**
 * One-time invitation used to grant a user Membership access to an
 * Organization (co-admin or org-level employee) — same pattern as
 * BusinessEmployeeInvitation, one level up (Organization instead of a
 * single Business).
 */
export interface MembershipInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: MembershipRole;
  token: string;
  status: MembershipInvitationStatus;
  invitedByUserId: string;
  acceptedUserId?: string;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
