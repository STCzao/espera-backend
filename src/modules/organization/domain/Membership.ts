export type MembershipRole = "admin" | "employee";
export type MembershipStatus = "active" | "revoked";

/**
 * Links a User to an Organization with a role scoped to that link.
 *
 * The effective role for a user is always resolved per Organization via
 * Membership, never from a global role field.
 */
export interface Membership {
  id: string;
  userId: string;
  organizationId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: MembershipRole;
  status: MembershipStatus;
  invitedByUserId?: string;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
