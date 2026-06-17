import { describe, expect, it } from "vitest";

import { ConfigureBusinessServiceWindowsUseCase } from "../../../src/modules/business/application/ConfigureBusinessServiceWindowsUseCase";
import { buildBusiness, InMemoryBusinessRepo } from "../../helpers/authFakes";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  activeServiceWindows: 3,
};

describe("ConfigureBusinessServiceWindowsUseCase", () => {
  it("configures active service windows for the owner business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo);

    const result = await useCase.execute(validInput);
    const updatedBusiness = await businessRepo.findById(validInput.businessId);

    expect(result).toEqual({
      businessId: validInput.businessId,
      activeServiceWindows: 3,
      attentionAvailable: true,
    });
    expect(updatedBusiness?.activeServiceWindows).toBe(3);
  });

  it("allows zero active service windows to pause attention", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        activeServiceWindows: 2,
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo);

    const result = await useCase.execute({
      ...validInput,
      activeServiceWindows: 0,
    });

    expect(result).toEqual({
      businessId: validInput.businessId,
      activeServiceWindows: 0,
      attentionAvailable: false,
    });
  });

  it("rejects updates from users that do not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: "33333333-3333-4333-8333-333333333333",
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo);

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });

  it("rejects negative active service windows", async () => {
    const useCase = new ConfigureBusinessServiceWindowsUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
    );

    await expect(
      useCase.execute({
        ...validInput,
        activeServiceWindows: -1,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Active service windows cannot be negative.",
    });
  });

  it("rejects decimal active service windows", async () => {
    const useCase = new ConfigureBusinessServiceWindowsUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
        }),
      ]),
    );

    await expect(
      useCase.execute({
        ...validInput,
        activeServiceWindows: 1.5,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Active service windows must be an integer.",
    });
  });
});
