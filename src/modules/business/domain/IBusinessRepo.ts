import type { Repository } from "../../../shared/kernel/Repository";
import type { Business } from "./Business";

export interface IBusinessRepo extends Repository<Business> {
  findBySlug(slug: string): Promise<Business | null>;
  findByOwnerUserId(ownerUserId: string): Promise<Business[]>;
  delete(id: string): Promise<void>;
  countByOrganizationId(organizationId: string): Promise<number>;
}
