import type { Repository } from "../../../shared/kernel/Repository";
import type { Membership } from "./Membership";

export interface IMembershipRepo extends Repository<Membership> {
  /** Only considers active memberships. */
  findByUserAndOrganization(userId: string, organizationId: string): Promise<Membership | null>;
  findByUser(userId: string): Promise<Membership[]>;
  /** Only considers active admin memberships. */
  findAdminByOrganization(organizationId: string): Promise<Membership | null>;
  /** Only active memberships, for the Organization's member list. */
  findByOrganizationId(organizationId: string): Promise<Membership[]>;
  revokeByOrganizationAndUser(
    organizationId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<Membership | null>;
}
