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
  address?: string;
  latitude?: number;
  longitude?: number;
  listingStatus: BusinessListingStatus;
  activeServiceWindows: number;
  operationalStatus: BusinessOperationalStatus;
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
