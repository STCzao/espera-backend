export type BusinessQrCodeStatus = "active" | "retiring" | "revoked";

export interface BusinessQrCode {
  id: string;
  businessId: string;
  token: string;
  status: BusinessQrCodeStatus;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}
