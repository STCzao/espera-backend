import type { BusinessCategory } from "./BusinessCategory";

export interface IBusinessCategoryRepo {
  findAll(): Promise<BusinessCategory[]>;
  findById(id: string): Promise<BusinessCategory | null>;
}
