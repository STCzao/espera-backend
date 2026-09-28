import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { BusinessCategoryConfig } from "../domain/BusinessCategoryConfig";
import { BusinessCategoryConfigRegistry } from "../domain/BusinessCategoryConfigRegistry";

const getBusinessCategoryConfigSchema = z.object({
  categoryId: z.string().uuid("Invalid category id."),
});

export type GetBusinessCategoryConfigInput = z.infer<
  typeof getBusinessCategoryConfigSchema
>;

export type GetBusinessCategoryConfigOutput = BusinessCategoryConfig;

export class GetBusinessCategoryConfigUseCase
  implements UseCase<GetBusinessCategoryConfigInput, GetBusinessCategoryConfigOutput>
{
  public constructor(
    private readonly categoryConfigRegistry = new BusinessCategoryConfigRegistry(),
  ) {}

  public async execute(
    input: GetBusinessCategoryConfigInput,
  ): Promise<GetBusinessCategoryConfigOutput> {
    const parsed = getBusinessCategoryConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    return this.categoryConfigRegistry.getConfig(parsed.data.categoryId);
  }
}
