import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessHoursRepo } from "../domain/IBusinessHoursRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessHoursRepo } from "../infrastructure/PostgresBusinessHoursRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const getBusinessHoursSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type GetBusinessHoursInput = z.infer<typeof getBusinessHoursSchema>;

export interface GetBusinessHoursOutput {
  businessId: string;
  weeklyHours: Array<{
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
  }>;
  nonWorkingDays: Array<{
    date: string;
    reason?: string;
  }>;
}

export class GetBusinessHoursUseCase
  implements UseCase<GetBusinessHoursInput, GetBusinessHoursOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly businessHoursRepo: IBusinessHoursRepo = new PostgresBusinessHoursRepo(),
  ) {}

  public async execute(input: GetBusinessHoursInput): Promise<GetBusinessHoursOutput> {
    const parsed = getBusinessHoursSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to view this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const config = await this.businessHoursRepo.findByBusinessId(parsed.data.businessId);

    return {
      businessId: config.businessId,
      weeklyHours: config.weeklyHours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
      })),
      nonWorkingDays: config.nonWorkingDays.map((day) => ({
        date: day.date,
        reason: day.reason,
      })),
    };
  }
}
