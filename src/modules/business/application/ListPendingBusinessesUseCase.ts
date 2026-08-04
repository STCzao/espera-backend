import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "../../../shared/kernel/UseCase";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  organizationId: z.string().uuid("Invalid organization id.").optional(),
  categoryId:     z.string().uuid("Invalid category id.").optional(),
  fromDate:       z.string().regex(DATE_REGEX, "fromDate must be in YYYY-MM-DD format.").optional(),
  toDate:         z.string().regex(DATE_REGEX, "toDate must be in YYYY-MM-DD format.").optional(),
});

export type ListPendingBusinessesInput = z.infer<typeof schema>;

export interface ListPendingBusinessesOutput {
  businesses: Business[];
}

/**
 * Lists Business pending independent approval under already-approved
 * Organizations (HU-8.2, second of the two separate lists). Supports
 * filtering by Organization, category and creation date range.
 */
export class ListPendingBusinessesUseCase
  implements UseCase<ListPendingBusinessesInput, ListPendingBusinessesOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: ListPendingBusinessesInput): Promise<ListPendingBusinessesOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const businesses = await this.businessRepo.findPending({
      organizationId: parsed.data.organizationId,
      categoryId:     parsed.data.categoryId,
      fromDate:       parsed.data.fromDate ? new Date(`${parsed.data.fromDate}T00:00:00.000Z`) : undefined,
      toDate:         parsed.data.toDate ? new Date(`${parsed.data.toDate}T23:59:59.999Z`) : undefined,
    });

    return { businesses };
  }
}
