export type MembershipRole = "admin" | "employee";

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
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
}
