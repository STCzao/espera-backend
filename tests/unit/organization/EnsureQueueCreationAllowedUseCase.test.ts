import { describe, expect, it } from "vitest";

import { EnsureQueueCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureQueueCreationAllowedUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

describe("EnsureQueueCreationAllowedUseCase", () => {
  it("rejects a second queue under a BASIC plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "basic" }),
    ]);
    const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentQueueCountForBusiness: 1 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_QUEUE_LIMIT_REACHED",
    });
  });

  it("allows multiple queues under PRO and PREMIUM plans", async () => {
    const proRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "pro" }),
    ]);
    const premiumRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-2", plan: "premium" }),
    ]);

    await expect(
      new EnsureQueueCreationAllowedUseCase(proRepo).execute({
        organizationId: "org-1",
        currentQueueCountForBusiness: 10,
      }),
    ).resolves.toBeUndefined();

    await expect(
      new EnsureQueueCreationAllowedUseCase(premiumRepo).execute({
        organizationId: "org-2",
        currentQueueCountForBusiness: 10,
      }),
    ).resolves.toBeUndefined();
  });

  describe("estado de la subscription", () => {
    it("rejects creating a queue when the subscription is cancelled, even under the plan's count limit", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: "org-1", plan: "premium", status: "cancelled" }),
      ]);
      const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentQueueCountForBusiness: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("rejects creating a queue when the subscription is expired", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: "org-1", status: "expired" }),
      ]);
      const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentQueueCountForBusiness: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });
  });
});
