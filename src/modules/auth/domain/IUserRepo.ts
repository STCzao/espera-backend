import type { Repository } from "../../../shared/kernel/Repository";
import type { User } from "./User";

export interface IUserRepo extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByVerificationToken(token: string): Promise<User | null>;
  delete(id: string): Promise<void>;
}
