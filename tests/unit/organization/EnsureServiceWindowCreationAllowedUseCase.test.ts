import { describe, expect, it } from "vitest";

import { EnsureServiceWindowCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureServiceWindowCreationAllowedUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

describe("EnsureServiceWindowCreationAllowedUseCase", () => {
  it("rejects a second service window under a BASIC plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "basic" }),
    ]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentServiceWindowCountForQueue: 1 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED",
    });
  });

  it("rejects the 11th service window under a PRO plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "pro" }),
    ]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentServiceWindowCountForQueue: 10 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED",
    });
  });

  it("allows up to 10 service windows under PRO and up to 20 under PREMIUM", async () => {
    const proRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "pro" }),
    ]);
    const premiumRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-2", plan: "premium" }),
    ]);

    await expect(
      new EnsureServiceWindowCreationAllowedUseCase(proRepo).execute({
        organizationId: "org-1",
        currentServiceWindowCountForQueue: 9,
      }),
    ).resolves.toBeUndefined();

    await expect(
      new EnsureServiceWindowCreationAllowedUseCase(premiumRepo).execute({
        organizationId: "org-2",
        currentServiceWindowCountForQueue: 19,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects the 21st service window under a PREMIUM plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentServiceWindowCountForQueue: 20 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED",
    });
  });

  it("defaults to basic when the organization has no subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-without-subscription", currentServiceWindowCountForQueue: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
  });

  describe("estado de la subscription", () => {
    it("rejects creating a service window when the subscription is cancelled, even under the plan's count limit", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: "org-1", plan: "premium", status: "cancelled" }),
      ]);
      const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentServiceWindowCountForQueue: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("rejects creating a service window when the subscription is expired", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: "org-1", status: "expired" }),
      ]);
      const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentServiceWindowCountForQueue: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });
  });
});
