import { describe, expect, it } from "vitest";

import { RevokeBusinessEmployeeUseCase } from "../../../src/modules/business/application/RevokeBusinessEmployeeUseCase";
import {
  buildBusiness,
  buildBusinessEmployee,
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
  InMemoryRefreshSessionRepo,
} from "../../helpers/authFakes";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
};

describe("RevokeBusinessEmployeeUseCase", () => {
  it("revokes employee access and active sessions", async () => {
    const employeeRepo = new InMemoryBusinessEmployeeRepo([
      buildBusinessEmployee({
        businessId: validInput.businessId,
        userId: validInput.userId,
      }),
    ]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new RevokeBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
      employeeRepo,
      refreshSessionRepo,
    );

    const result = await useCase.execute(validInput);

    expect(result).toEqual({
      businessId: validInput.businessId,
      userId: validInput.userId,
      revoked: true,
    });
    expect(employeeRepo.all()[0]).toMatchObject({
      status: "revoked",
      revokedAt: expect.any(Date),
    });
    expect(refreshSessionRepo.revokedUserIds).toEqual([validInput.userId]);
  });

  it("rejects revocation from users that do not own the business", async () => {
    const useCase = new RevokeBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: "different-owner",
        }),
      ]),
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryRefreshSessionRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });
});
