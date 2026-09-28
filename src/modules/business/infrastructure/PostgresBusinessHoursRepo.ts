import { randomUUID } from "node:crypto";

import { prisma } from "@shared/infrastructure/prisma";
import type {
  BusinessHoursConfig,
  BusinessNonWorkingDay,
  BusinessOpeningHour,
} from "../domain/BusinessHours";
import type { IBusinessHoursRepo } from "../domain/IBusinessHoursRepo";

const toDateOnlyString = (date: Date): string => date.toISOString().slice(0, 10);

const toUtcDateOnly = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

export class PostgresBusinessHoursRepo implements IBusinessHoursRepo {
  public async findByBusinessId(businessId: string): Promise<BusinessHoursConfig> {
    const [weeklyHours, nonWorkingDays] = await Promise.all([
      prisma.businessOpeningHour.findMany({
        where: { businessId },
        orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
      }),
      prisma.businessNonWorkingDay.findMany({
        where: { businessId },
        orderBy: { date: "asc" },
      }),
    ]);

    return {
      businessId,
      weeklyHours: weeklyHours.map((hour): BusinessOpeningHour => ({
        id: hour.id,
        businessId: hour.businessId,
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        createdAt: hour.createdAt,
        updatedAt: hour.updatedAt,
      })),
      nonWorkingDays: nonWorkingDays.map((day): BusinessNonWorkingDay => ({
        id: day.id,
        businessId: day.businessId,
        date: toDateOnlyString(day.date),
        reason: day.reason ?? undefined,
        createdAt: day.createdAt,
        updatedAt: day.updatedAt,
      })),
    };
  }

  public async replaceForBusiness(
    config: BusinessHoursConfig,
  ): Promise<BusinessHoursConfig> {
    await prisma.$transaction(async (tx) => {
      await tx.businessOpeningHour.deleteMany({
        where: { businessId: config.businessId },
      });
      await tx.businessNonWorkingDay.deleteMany({
        where: { businessId: config.businessId },
      });

      if (config.weeklyHours.length > 0) {
        await tx.businessOpeningHour.createMany({
          data: config.weeklyHours.map((hour) => ({
            id: hour.id || randomUUID(),
            businessId: config.businessId,
            dayOfWeek: hour.dayOfWeek,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
          })),
        });
      }

      if (config.nonWorkingDays.length > 0) {
        await tx.businessNonWorkingDay.createMany({
          data: config.nonWorkingDays.map((day) => ({
            id: day.id || randomUUID(),
            businessId: config.businessId,
            date: toUtcDateOnly(day.date),
            reason: day.reason ?? null,
          })),
        });
      }
    });

    return this.findByBusinessId(config.businessId);
  }
}
