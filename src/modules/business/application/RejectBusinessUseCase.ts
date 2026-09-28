import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendBusinessRejectedEmail } from "@shared/infrastructure/email";
import { logger } from "@shared/infrastructure/logger";
import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import type { UseCase } from "../../../shared/kernel/UseCase";
import type { Business } from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const schema = z.object({
  businessId:       z.string().uuid("Invalid business id."),
  rejectedByUserId: z.string().uuid("Invalid reviewer id."),
  reason:           z.string().trim().min(1, "Rejection reason is required.").max(500),
});

export type RejectBusinessInput = z.infer<typeof schema>;

/**
 * Rejects a single pending Business (HU-8.3), independent from the
 * Organization's own approval status and from any other Business under it.
 */
export class RejectBusinessUseCase implements UseCase<RejectBusinessInput, Business> {
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: RejectBusinessInput): Promise<Business> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.status !== "pending") {
      throw AppError.conflict("Only a pending business can be rejected.", "BUSINESS_NOT_PENDING");
    }

    const now = new Date();
    const updated = await this.businessRepo.save({
      ...business,
      status: "rejected",
      rejectedReason: parsed.data.reason,
      rejectedAt: now,
      approvedByUserId: undefined,
      approvedAt: undefined,
      updatedAt: now,
    });

    const owner = await this.userRepo.findById(business.ownerUserId);
    if (owner) {
      try {
        await sendBusinessRejectedEmail(owner.email, owner.firstName, business.name, parsed.data.reason);
      } catch (error) {
        logger.error(
          { error, businessId: business.id },
          "Business rejected but notification email could not be sent",
        );
      }
    }

    return updated;
  }
}
