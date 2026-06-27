import type { Repository } from "../../../shared/kernel/Repository";
import type { Membership } from "./Membership";

export interface IMembershipRepo extends Repository<Membership> {
  findByUserAndOrganization(userId: string, organizationId: string): Promise<Membership | null>;
  findByUser(userId: string): Promise<Membership[]>;
}
