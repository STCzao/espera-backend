import type { Repository } from "../../../shared/kernel/Repository";
import type { Business, BusinessStatus } from "./Business";

export interface FindPendingBusinessesFilters {
  organizationId?: string;
  categoryId?: string;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Subscription-derived filters, resolved against the Business's Organization.
 *
 * `effectiveStatus` is the *reconciled* status, the same one
 * ResolveEffectiveSubscriptionStatusUseCase computes: a subscription still
 * stored as "trial" whose trialEndsAt has passed counts as "expired" here,
 * so filtering never depends on whether anything has gotten around to
 * persisting that transition yet.
 *
 * The literal unions mirror the organization module's SubscriptionPlan and
 * SubscriptionStatus; they're repeated instead of imported because the
 * business domain layer may only depend on `shared` (see .eslintrc.json's
 * boundaries rules).
 */
export interface BusinessSubscriptionFilters {
  plan?: "basic" | "pro" | "premium";
  effectiveStatus?: "pending" | "trial" | "active" | "expired" | "cancelled";
}

export interface FindManyBusinessesFilters {
  organizationId?: string;
  categoryId?: string;
  status?: BusinessStatus;
  sortBy?: "businessName" | "createdAt";
  sortDir?: "asc" | "desc";
  skip?: number;
  take?: number;
  /** Matches only businesses whose Organization has a subscription like this. */
  subscription?: BusinessSubscriptionFilters;
}

export interface IBusinessRepo extends Repository<Business> {
  findBySlug(slug: string): Promise<Business | null>;
  findByOwnerUserId(ownerUserId: string): Promise<Business[]>;
  findByOrganizationId(organizationId: string): Promise<Business[]>;
  findPending(filters?: FindPendingBusinessesFilters): Promise<Business[]>;
  /**
   * Unfiltered by date/Turn activity — every Business matching the given
   * filters, regardless of status. `sortBy`/`sortDir`/`skip`/`take` push
   * ordering and pagination down to the database when provided; omit them
   * to get every matching row.
   */
  findMany(filters?: FindManyBusinessesFilters): Promise<Business[]>;
  /** Same filters as findMany (sortBy/sortDir/skip/take ignored), total count only. */
  countMany(filters?: FindManyBusinessesFilters): Promise<number>;
  delete(id: string): Promise<void>;
  countByOrganizationId(organizationId: string): Promise<number>;
  countByStatus(status: BusinessStatus): Promise<number>;
}
