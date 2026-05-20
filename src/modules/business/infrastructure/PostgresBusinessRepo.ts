import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";

export class PostgresBusinessRepo implements IBusinessRepo {
  public async findById(_id: string): Promise<Business | null> {
    return null;
  }

  public async findBySlug(_slug: string): Promise<Business | null> {
    return null;
  }

  public async save(entity: Business): Promise<Business> {
    return entity;
  }
}
