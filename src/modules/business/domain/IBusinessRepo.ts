import type { Repository } from "../../../shared/kernel/Repository";
import type { Business, BusinessStatus } from "./Business";

export interface FindPendingBusinessesFilters {
  organizationId?: string;
  categoryId?: string;
  fromDate?: Date;
  toDate?: Date;
}

export interface FindManyBusinessesFilters {
  organizationId?: string;
  categoryId?: string;
  status?: BusinessStatus;
  sortBy?: "businessName" | "createdAt";
  sortDir?: "asc" | "desc";
  skip?: number;
  take?: number;
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
   * to get every matching row (a caller that also needs to filter by a
   * *derived* field — like effective subscription plan/status, which
   * isn't a queryable column — has to paginate in memory after resolving
   * that field itself, see ListAllBusinessesUseCase).
   */
  findMany(filters?: FindManyBusinessesFilters): Promise<Business[]>;
  /** Same filters as findMany (sortBy/sortDir/skip/take ignored), total count only. */
  countMany(filters?: FindManyBusinessesFilters): Promise<number>;
  delete(id: string): Promise<void>;
  countByOrganizationId(organizationId: string): Promise<number>;
  countByStatus(status: BusinessStatus): Promise<number>;
}
