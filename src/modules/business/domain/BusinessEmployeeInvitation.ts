export type BusinessEmployeeInvitationStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired";

/**
 * One-time invitation used to attach an employee account to a business.
 *
 * The token is intentionally separate from auth sessions: it proves invitation
 * ownership only until acceptance or expiry, not ongoing access.
 */
export interface BusinessEmployeeInvitation {
  id: string;
  businessId: string;
  email: string;
  token: string;
  status: BusinessEmployeeInvitationStatus;
  invitedByUserId: string;
  acceptedUserId?: string;
  expiresAt: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
