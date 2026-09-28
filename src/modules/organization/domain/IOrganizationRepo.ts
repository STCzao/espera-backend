import type { Repository } from "../../../shared/kernel/Repository";
import type { Organization } from "./Organization";

export interface IOrganizationRepo extends Repository<Organization> {
  findPending(): Promise<Organization[]>;
}
