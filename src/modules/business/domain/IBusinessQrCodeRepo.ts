import type { Repository } from "@shared/kernel/Repository";
import type { BusinessQrCode } from "./BusinessQrCode";

export interface IBusinessQrCodeRepo extends Repository<BusinessQrCode> {
  findActiveByBusinessId(businessId: string): Promise<BusinessQrCode | null>;
  findResolvableByToken(token: string, now: Date): Promise<BusinessQrCode | null>;
  retireActiveForBusiness(businessId: string, validUntil: Date): Promise<void>;
}
