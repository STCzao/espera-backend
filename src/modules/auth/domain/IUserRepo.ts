import type { Repository } from "../../../shared/kernel/Repository";
import type { ApprovalStatus, User, UserRole } from "./User";

/**
 * Mirrors FindManyBusinessesFilters (business/domain/IBusinessRepo.ts) —
 * same shape, same reasoning: push filtering/sorting/pagination down to
 * Postgres instead of reading every user to filter in memory.
 */
export interface FindManyUsersFilters {
  role?: UserRole;
  isBlocked?: boolean;
  approvalStatus?: ApprovalStatus;
  /** Free text matched against email/firstName/lastName (case-insensitive). */
  search?: string;
  sortBy?: "name" | "createdAt";
  sortDir?: "asc" | "desc";
  skip?: number;
  take?: number;
}

export interface IUserRepo extends Repository<User> {
  /**
   * Finds a user by email address.
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Finds a user by email verification token.
   */
  findByVerificationToken(token: string): Promise<User | null>;

  /**
   * Finds a user by password reset token
   */

  findByPasswordResetToken(token: string): Promise<User | null>;

  /**
   * Deletes a user by id.
   */
  delete(id: string): Promise<void>;

  /**
   * Total number of registered users, regardless of role.
   */
  count(): Promise<number>;

  /** Unfiltered by date — every user matching the given filters. */
  findMany(filters?: FindManyUsersFilters): Promise<User[]>;
  /** Same filters as findMany (sortBy/sortDir/skip/take ignored), total count only. */
  countMany(filters?: FindManyUsersFilters): Promise<number>;
}
