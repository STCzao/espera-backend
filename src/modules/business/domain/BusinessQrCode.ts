export type BusinessQrCodeStatus = "active" | "retiring" | "revoked";

/**
 * Printable QR identity for a business.
 *
 * Regeneration creates a new active token and leaves the previous one in
 * `retiring` state for a short operational transition window.
 */
export interface BusinessQrCode {
  id: string;
  businessId: string;
  token: string;
  status: BusinessQrCodeStatus;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}
