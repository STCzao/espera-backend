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

  it("rejects a second queue under PRO and PREMIUM plans too", async () => {
    // maxQueuesPerBusiness is 1 across every plan on purpose — a second
    // Queue only matters once a customer can be routed to it, and no entry
    // point does that yet (see PlanLimits.ts). This isn't a Basic-only cap.
    const proRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "pro" }),
    ]);
    const premiumRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-2", plan: "premium" }),
    ]);

    await expect(
      new EnsureQueueCreationAllowedUseCase(proRepo).execute({
        organizationId: "org-1",
        currentQueueCountForBusiness: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_QUEUE_LIMIT_REACHED" });

    await expect(
      new EnsureQueueCreationAllowedUseCase(premiumRepo).execute({
        organizationId: "org-2",
        currentQueueCountForBusiness: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_QUEUE_LIMIT_REACHED" });
  });

  it("allows the first queue under any plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentQueueCountForBusiness: 0 }),
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
