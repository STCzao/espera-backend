import type { Repository } from "../../../shared/kernel/Repository";
import type { User } from "./User";

export interface IUserRepo extends Repository<User> {
  /**
   * Finds a user by email address.
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Finds a user by the persisted refresh token hash.
   */
  findByRefreshTokenHash(hash: string): Promise<User | null>;

  /**
   * Finds a user by email verification token.
   */
  findByVerificationToken(token: string): Promise<User | null>;

  /**
   * Deletes a user by id.
   */
  delete(id: string): Promise<void>;
}
