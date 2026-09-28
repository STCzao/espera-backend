import type { Repository } from "../../../shared/kernel/Repository";
import type { Subscription } from "./Subscription";

export interface ISubscriptionRepo extends Repository<Subscription> {
  findByOrganizationId(organizationId: string): Promise<Subscription | null>;
}
