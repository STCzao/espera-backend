import type { Repository } from "@shared/kernel/Repository";
import type { BusinessEmployee } from "./BusinessEmployee";

export interface IBusinessEmployeeRepo extends Repository<BusinessEmployee> {
  findActiveByBusinessAndUser(
    businessId: string,
    userId: string,
  ): Promise<BusinessEmployee | null>;
  findByBusinessId(businessId: string): Promise<BusinessEmployee[]>;
  revokeByBusinessAndUser(
    businessId: string,
    userId: string,
    revokedAt: Date,
  ): Promise<BusinessEmployee | null>;
}
