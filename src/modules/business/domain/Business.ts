export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended";
export type BusinessListingStatus = "draft" | "hidden" | "published";
export type BusinessOperationalStatus = "normal" | "delayed" | "paused" | "closed";

/**
 * Business aggregate snapshot used by the panel.
 *
 * `listingStatus` controls public discovery, while `operationalStatus` controls
 * whether the business is currently accepting new turns. `status` is the
 * commercial approval gate, reviewed independently from its Organization's
 * own approval (backlog v2.4 — two-level approval).
 */
export interface Business {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  status: BusinessStatus;
  approvedByUserId?: string;
  approvedAt?: Date;
  rejectedReason?: string;
  rejectedAt?: Date;
  suspendedByUserId?: string;
  suspendedAt?: Date;
  suspensionReason?: string;
  reactivatedByUserId?: string;
  reactivatedAt?: Date;
  phone?: string;
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
