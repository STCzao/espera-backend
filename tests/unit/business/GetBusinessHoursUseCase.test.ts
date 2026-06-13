import { describe, expect, it } from "vitest";

import { GetBusinessHoursUseCase } from "../../../src/modules/business/application/GetBusinessHoursUseCase";
import {
  buildBusiness,
  InMemoryBusinessHoursRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

const businessId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";

describe("GetBusinessHoursUseCase", () => {
  it("returns configured hours for the owner business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: businessId, ownerUserId }),
    ]);
    const businessHoursRepo = new InMemoryBusinessHoursRepo([
      {
        businessId,
        weeklyHours: [
          {
            id: "hour-1",
            businessId,
            dayOfWeek: 1,
            opensAt: "09:00",
            closesAt: "18:00",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
        nonWorkingDays: [
          {
            id: "day-1",
            businessId,
            date: "2026-12-25",
            reason: "Feriado",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
      },
    ]);
    const useCase = new GetBusinessHoursUseCase(businessRepo, businessHoursRepo);

    const result = await useCase.execute({ businessId, ownerUserId });

    expect(result).toEqual({
      businessId,
      weeklyHours: [
        {
          dayOfWeek: 1,
          opensAt: "09:00",
          closesAt: "18:00",
        },
      ],
      nonWorkingDays: [
        {
          date: "2026-12-25",
          reason: "Feriado",
        },
      ],
    });
  });

  it("rejects reads from users that do not own the business", async () => {
    const useCase = new GetBusinessHoursUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: businessId,
          ownerUserId: "33333333-3333-4333-8333-333333333333",
        }),
      ]),
      new InMemoryBusinessHoursRepo(),
    );

    await expect(useCase.execute({ businessId, ownerUserId })).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });
});
