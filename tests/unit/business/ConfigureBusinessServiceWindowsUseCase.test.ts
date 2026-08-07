import { describe, expect, it } from "vitest";

import { ConfigureBusinessServiceWindowsUseCase } from "../../../src/modules/business/application/ConfigureBusinessServiceWindowsUseCase";
import { buildBusiness, InMemoryBusinessRepo } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

const ORGANIZATION_ID = "organization-1";

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  activeServiceWindows: 3,
};

// Default plan is premium (generous cap) so tests unrelated to plan limits
// don't need to think about them; the limit itself is covered separately below.
const premiumSubscriptionRepo = () => new InMemorySubscriptionRepo([
  buildSubscription({ organizationId: ORGANIZATION_ID, plan: "premium" }),
]);

describe("ConfigureBusinessServiceWindowsUseCase", () => {
  it("configures active service windows for the owner business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        organizationId: ORGANIZATION_ID,
        status: "approved",
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, premiumSubscriptionRepo());

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
        organizationId: ORGANIZATION_ID,
        activeServiceWindows: 2,
        status: "approved",
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, premiumSubscriptionRepo());

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

  it("rejects updates when the business is not operating", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: validInput.ownerUserId,
        organizationId: ORGANIZATION_ID,
        status: "suspended",
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, premiumSubscriptionRepo());

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_NOT_OPERATING",
    });
  });

  it("rejects updates from users that do not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({
        id: validInput.businessId,
        ownerUserId: "33333333-3333-4333-8333-333333333333",
        organizationId: ORGANIZATION_ID,
      }),
    ]);
    const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, premiumSubscriptionRepo());

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
          organizationId: ORGANIZATION_ID,
        }),
      ]),
      premiumSubscriptionRepo(),
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
          organizationId: ORGANIZATION_ID,
        }),
      ]),
      premiumSubscriptionRepo(),
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

  describe("límite por plan", () => {
    it("rejects a value above 1 under a BASIC plan", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          organizationId: ORGANIZATION_ID,
          status: "approved",
        }),
      ]);
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORGANIZATION_ID, plan: "basic" }),
      ]);
      const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, subscriptionRepo);

      await expect(
        useCase.execute({ ...validInput, activeServiceWindows: 2 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
    });

    it("allows exactly the plan limit under a BASIC plan", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          organizationId: ORGANIZATION_ID,
          status: "approved",
        }),
      ]);
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORGANIZATION_ID, plan: "basic" }),
      ]);
      const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, subscriptionRepo);

      await expect(
        useCase.execute({ ...validInput, activeServiceWindows: 1 }),
      ).resolves.toMatchObject({ activeServiceWindows: 1 });
    });

    it("rejects a value above 3 under a PRO plan", async () => {
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          organizationId: ORGANIZATION_ID,
          status: "approved",
        }),
      ]);
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORGANIZATION_ID, plan: "pro" }),
      ]);
      const useCase = new ConfigureBusinessServiceWindowsUseCase(businessRepo, subscriptionRepo);

      await expect(
        useCase.execute({ ...validInput, activeServiceWindows: 4 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
    });
  });
});
