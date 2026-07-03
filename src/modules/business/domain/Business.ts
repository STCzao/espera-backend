export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended";
export type BusinessListingStatus = "draft" | "hidden" | "published";
export type BusinessOperationalStatus = "normal" | "delayed" | "paused" | "closed";

/**
 * Business aggregate snapshot used by the panel.
 *
 * `listingStatus` controls public discovery, while `operationalStatus` controls
 * whether the business is currently accepting new turns.
 */
export interface Business {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  status: BusinessStatus;
  address?: string;
  latitude?: number;
  longitude?: number;
  listingStatus: BusinessListingStatus;
  activeServiceWindows: number;
  operationalStatus: BusinessOperationalStatus;
  ownerUserId: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}
