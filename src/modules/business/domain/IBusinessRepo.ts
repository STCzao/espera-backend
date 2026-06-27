import type { Repository } from "../../../shared/kernel/Repository";
import type { Business } from "./Business";

export interface IBusinessRepo extends Repository<Business> {
  findBySlug(slug: string): Promise<Business | null>;
  delete(id: string): Promise<void>;
  countByOrganizationId(organizationId: string): Promise<number>;
}
