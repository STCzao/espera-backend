export type BusinessListingStatus = "draft" | "hidden" | "published";

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
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
