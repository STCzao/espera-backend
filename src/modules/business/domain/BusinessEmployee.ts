export type BusinessEmployeeStatus = "active" | "revoked";

/**
 * Business-scoped employee membership.
 *
 * The global `employee` role only describes what the account can do in general;
 * this entity defines the specific business where that access applies.
 */
export interface BusinessEmployee {
  id: string;
  businessId: string;
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  status: BusinessEmployeeStatus;
  invitedByUserId: string;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
