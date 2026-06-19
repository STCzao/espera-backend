import { describe, expect, it } from "vitest";

import { BusinessAvailabilityService } from "../../../src/modules/business/domain/BusinessAvailabilityService";
import type { BusinessHoursConfig } from "../../../src/modules/business/domain/BusinessHours";
import { buildBusiness } from "../../helpers/authFakes";

const mondayTenUtc = new Date("2026-06-15T10:00:00.000Z");
const mondayEighteenUtc = new Date("2026-06-15T18:00:00.000Z");

const hoursConfig: BusinessHoursConfig = {
  businessId: "business-1",
  weeklyHours: [
    {
      id: "hour-1",
      businessId: "business-1",
      dayOfWeek: 1,
      opensAt: "09:00",
      closesAt: "13:00",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "hour-2",
      businessId: "business-1",
      dayOfWeek: 1,
      opensAt: "14:00",
      closesAt: "18:00",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  nonWorkingDays: [],
};

describe("BusinessAvailabilityService", () => {
  it("marks a published business as available inside opening hours", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({ listingStatus: "published" }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(true);
  });

  it("does not mark a business as available outside opening hours", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({ listingStatus: "published" }),
      hoursConfig,
      now: mondayEighteenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(false);
  });

  it("does not mark draft businesses as available", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({ listingStatus: "draft" }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(false);
  });

  it("does not mark pending businesses as publicly available", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({
        approvalStatus: "pending",
        listingStatus: "published",
      }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(false);
  });

  it("does not mark businesses without active service windows as available", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({
        listingStatus: "published",
        activeServiceWindows: 0,
      }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(false);
  });

  it("marks delayed businesses as available inside opening hours", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({
        listingStatus: "published",
        operationalStatus: "delayed",
      }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(true);
  });

  it("does not mark paused or closed businesses as available", () => {
    const service = new BusinessAvailabilityService();

    const paused = service.isAvailableNow({
      business: buildBusiness({
        listingStatus: "published",
        operationalStatus: "paused",
      }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });
    const closed = service.isAvailableNow({
      business: buildBusiness({
        listingStatus: "published",
        operationalStatus: "closed",
      }),
      hoursConfig,
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(paused).toBe(false);
    expect(closed).toBe(false);
  });

  it("does not mark a business as available on non-working days", () => {
    const service = new BusinessAvailabilityService();

    const isAvailable = service.isAvailableNow({
      business: buildBusiness({ listingStatus: "published" }),
      hoursConfig: {
        ...hoursConfig,
        nonWorkingDays: [
          {
            id: "day-1",
            businessId: "business-1",
            date: "2026-06-15",
            reason: "Feriado",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
      now: mondayTenUtc,
      timeZone: "UTC",
    });

    expect(isAvailable).toBe(false);
  });
});
