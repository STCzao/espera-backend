import type { UseCase } from "../../../shared/kernel/UseCase";
import type { BusinessCategory } from "../domain/BusinessCategory";
import type { IBusinessCategoryRepo } from "../domain/IBusinessCategoryRepo";
import { PostgresBusinessCategoryRepo } from "../infrastructure/PostgresBusinessCategoryRepo";

export interface GetBusinessCategoriesOutput {
  categories: BusinessCategory[];
}

export class GetBusinessCategoriesUseCase
  implements UseCase<void, GetBusinessCategoriesOutput>
{
  public constructor(
    private readonly categoryRepo: IBusinessCategoryRepo = new PostgresBusinessCategoryRepo(),
  ) {}

  public async execute(): Promise<GetBusinessCategoriesOutput> {
    const categories = await this.categoryRepo.findAll();
    return { categories };
  }
}
