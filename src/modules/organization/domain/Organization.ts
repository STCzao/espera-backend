export type OrganizationStatus = "pending" | "approved" | "rejected";

/**
 * Organization is the billing "account": it groups N Business (physical
 * branches) under a single Subscription plan.
 *
 * Commercial approval happens at two independent levels (backlog v2.4):
 * the Organization is approved once by the Espera team, and each Business
 * under it is reviewed independently afterwards — approving the
 * Organization does not auto-approve any Business.
 */
export interface Organization {
  id: string;
  name: string;
  legalId?: string;
  status: OrganizationStatus;
  approvedByUserId?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  rejectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
