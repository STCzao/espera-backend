import { describe, expect, it } from "vitest";

import { ConfigureBusinessHoursUseCase } from "../../../src/modules/business/application/ConfigureBusinessHoursUseCase";
import {
  buildBusiness,
  InMemoryBusinessHoursRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  weeklyHours: [
    {
      dayOfWeek: 1,
      opensAt: "09:00",
      closesAt: "13:00",
    },
    {
      dayOfWeek: 1,
      opensAt: "14:00",
      closesAt: "18:00",
    },
    {
      dayOfWeek: 2,
      opensAt: "10:00",
      closesAt: "16:00",
    },
  ],
  nonWorkingDays: [
    {
      date: "2026-12-25",
      reason: "Feriado",
    },
  ],
};

describe("ConfigureBusinessHoursUseCase", () => {
  it("configures weekly hours and non-working days for the owner business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
      }),
    ]);
    const businessHoursRepo = new InMemoryBusinessHoursRepo();
    const useCase = new ConfigureBusinessHoursUseCase(
      businessRepo,
      businessHoursRepo,
    );

    const result = await useCase.execute(validInput);
    const savedConfig = await businessHoursRepo.findByBusinessId(validInput.businessId);

    expect(result).toEqual({
      businessId: validInput.businessId,
      weeklyHours: validInput.weeklyHours,
      nonWorkingDays: validInput.nonWorkingDays,
    });
    expect(savedConfig.weeklyHours).toHaveLength(3);
    expect(savedConfig.nonWorkingDays).toHaveLength(1);
  });

  it("rejects updates from users that do not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: "33333333-3333-4333-8333-333333333333",
      }),
    ]);
    const useCase = new ConfigureBusinessHoursUseCase(
      businessRepo,
      new InMemoryBusinessHoursRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });

  it("rejects opening ranges where closing time is not after opening time", async () => {
    const useCase = new ConfigureBusinessHoursUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
      new InMemoryBusinessHoursRepo(),
    );

    await expect(
      useCase.execute({
        ...validInput,
        weeklyHours: [
          {
            dayOfWeek: 1,
            opensAt: "18:00",
            closesAt: "09:00",
          },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_OPENING_RANGE",
    });
  });

  it("rejects overlapping opening ranges on the same day", async () => {
    const useCase = new ConfigureBusinessHoursUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
      new InMemoryBusinessHoursRepo(),
    );

    await expect(
      useCase.execute({
        ...validInput,
        weeklyHours: [
          {
            dayOfWeek: 1,
            opensAt: "09:00",
            closesAt: "13:00",
          },
          {
            dayOfWeek: 1,
            opensAt: "12:30",
            closesAt: "18:00",
          },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "OPENING_RANGES_OVERLAP",
    });
  });

  it("rejects duplicated non-working days", async () => {
    const useCase = new ConfigureBusinessHoursUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
      new InMemoryBusinessHoursRepo(),
    );

    await expect(
      useCase.execute({
        ...validInput,
        nonWorkingDays: [
          { date: "2026-12-25" },
          { date: "2026-12-25" },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "DUPLICATED_NON_WORKING_DAY",
    });
  });

  it("rejects invalid calendar dates for non-working days", async () => {
    const useCase = new ConfigureBusinessHoursUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
      new InMemoryBusinessHoursRepo(),
    );

    await expect(
      useCase.execute({
        ...validInput,
        nonWorkingDays: [{ date: "2026-02-31" }],
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_NON_WORKING_DAY",
    });
  });
});
