import { randomUUID } from "node:crypto";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { BusinessHoursConfig } from "../domain/BusinessHours";
import type { IBusinessHoursRepo } from "../domain/IBusinessHoursRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessHoursRepo } from "../infrastructure/PostgresBusinessHoursRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const openingHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: z.string().regex(timeRegex, "Opening time must use HH:mm format."),
  closesAt: z.string().regex(timeRegex, "Closing time must use HH:mm format."),
});

const nonWorkingDaySchema = z.object({
  date: z.string().regex(dateRegex, "Non-working day must use YYYY-MM-DD format."),
  reason: z.string().trim().max(120).optional(),
});

const configureBusinessHoursSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  weeklyHours: z.array(openingHourSchema).min(1, "At least one opening range is required."),
  nonWorkingDays: z.array(nonWorkingDaySchema).default([]),
});

export type ConfigureBusinessHoursInput = z.infer<typeof configureBusinessHoursSchema>;

export interface ConfigureBusinessHoursOutput {
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

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const isValidDateOnly = (date: string): boolean => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

export class ConfigureBusinessHoursUseCase
  implements UseCase<ConfigureBusinessHoursInput, ConfigureBusinessHoursOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly businessHoursRepo: IBusinessHoursRepo = new PostgresBusinessHoursRepo(),
  ) {}

  public async execute(
    input: ConfigureBusinessHoursInput,
  ): Promise<ConfigureBusinessHoursOutput> {
    const parsed = configureBusinessHoursSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    this.ensureValidOpeningRanges(parsed.data.weeklyHours);
    this.ensureValidNonWorkingDays(parsed.data.nonWorkingDays);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to edit this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const now = new Date();
    const config: BusinessHoursConfig = {
      businessId: parsed.data.businessId,
      weeklyHours: parsed.data.weeklyHours.map((hour) => ({
        id: randomUUID(),
        businessId: parsed.data.businessId,
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        createdAt: now,
        updatedAt: now,
      })),
      nonWorkingDays: parsed.data.nonWorkingDays.map((day) => ({
        id: randomUUID(),
        businessId: parsed.data.businessId,
        date: day.date,
        reason: day.reason,
        createdAt: now,
        updatedAt: now,
      })),
    };

    const savedConfig = await this.businessHoursRepo.replaceForBusiness(config);

    return {
      businessId: savedConfig.businessId,
      weeklyHours: savedConfig.weeklyHours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
      })),
      nonWorkingDays: savedConfig.nonWorkingDays.map((day) => ({
        date: day.date,
        reason: day.reason,
      })),
    };
  }

  private ensureValidOpeningRanges(
    weeklyHours: ConfigureBusinessHoursInput["weeklyHours"],
  ): void {
    const rangesByDay = new Map<number, Array<{ opensAt: number; closesAt: number }>>();

    weeklyHours.forEach((hour) => {
      const opensAt = toMinutes(hour.opensAt);
      const closesAt = toMinutes(hour.closesAt);

      if (opensAt >= closesAt) {
        throw AppError.badRequest(
          "Opening time must be before closing time.",
          "INVALID_OPENING_RANGE",
        );
      }

      const ranges = rangesByDay.get(hour.dayOfWeek) ?? [];
      ranges.push({ opensAt, closesAt });
      rangesByDay.set(hour.dayOfWeek, ranges);
    });

    rangesByDay.forEach((ranges) => {
      const sortedRanges = [...ranges].sort((first, second) => first.opensAt - second.opensAt);

      for (let index = 1; index < sortedRanges.length; index += 1) {
        if (sortedRanges[index].opensAt < sortedRanges[index - 1].closesAt) {
          throw AppError.badRequest(
            "Opening ranges cannot overlap on the same day.",
            "OPENING_RANGES_OVERLAP",
          );
        }
      }
    });
  }

  private ensureValidNonWorkingDays(
    nonWorkingDays: ConfigureBusinessHoursInput["nonWorkingDays"],
  ): void {
    const dates = new Set<string>();

    nonWorkingDays.forEach((day) => {
      if (!isValidDateOnly(day.date)) {
        throw AppError.badRequest(
          "Non-working day must be a valid calendar date.",
          "INVALID_NON_WORKING_DAY",
        );
      }

      if (dates.has(day.date)) {
        throw AppError.badRequest(
          "Non-working days cannot be duplicated.",
          "DUPLICATED_NON_WORKING_DAY",
        );
      }

      dates.add(day.date);
    });
  }
}
