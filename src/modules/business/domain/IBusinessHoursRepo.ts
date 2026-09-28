import type { BusinessHoursConfig } from "./BusinessHours";

export interface IBusinessHoursRepo {
  findByBusinessId(businessId: string): Promise<BusinessHoursConfig>;
  replaceForBusiness(config: BusinessHoursConfig): Promise<BusinessHoursConfig>;
}
