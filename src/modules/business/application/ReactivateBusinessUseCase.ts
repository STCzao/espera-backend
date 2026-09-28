import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const schema = z.object({
  businessId:           z.string().uuid("Invalid business id."),
  reactivatedByUserId:  z.string().uuid("Invalid reviewer id."),
});

export type ReactivateBusinessInput = z.infer<typeof schema>;

/**
 * Reactivates a suspended Business (HU-8.4). Employees and the owner
 * recover access simply by logging in again — no session to restore, since
 * suspension only revoked their existing sessions, it didn't lock the
 * accounts themselves.
 */
export class ReactivateBusinessUseCase implements UseCase<ReactivateBusinessInput, Business> {
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: ReactivateBusinessInput): Promise<Business> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.status !== "suspended") {
      throw AppError.conflict("Only a suspended business can be reactivated.", "BUSINESS_NOT_SUSPENDED");
    }

    const now = new Date();
    return this.businessRepo.save({
      ...business,
      status: "approved",
      reactivatedByUserId: parsed.data.reactivatedByUserId,
      reactivatedAt: now,
      updatedAt: now,
    });
  }
}
