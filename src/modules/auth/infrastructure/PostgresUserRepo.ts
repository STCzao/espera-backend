import type { IUserRepo } from "../domain/IUserRepo";
import type { User } from "../domain/User";

export class PostgresUserRepo implements IUserRepo {
  public async findById(_id: string): Promise<User | null> {
    return null;
  }

  public async findByEmail(_email: string): Promise<User | null> {
    return null;
  }

  public async save(entity: User): Promise<User> {
    return entity;
  }
}
