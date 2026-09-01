import { describe, expect, it } from "vitest";

import { EnsureQueueCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureQueueCreationAllowedUseCase";
import { EnforceQueueLimitsForOrganizationUseCase } from "../../../src/modules/queue/application/EnforceQueueLimitsForOrganizationUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const buildEnforceQueueLimits = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => new EnforceQueueLimitsForOrganizationUseCase(
  options.businessRepo ?? new InMemoryBusinessRepo(),
  options.queueRepo ?? new InMemoryQueueRepo(),
  options.windowRepo ?? new InMemoryServiceWindowRepo(),
);

describe("EnsureQueueCreationAllowedUseCase", () => {
  it("rejects a second queue under a BASIC plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "basic" }),
    ]);
    const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

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
      new EnsureQueueCreationAllowedUseCase(proRepo, buildEnforceQueueLimits()).execute({
        organizationId: "org-1",
        currentQueueCountForBusiness: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_QUEUE_LIMIT_REACHED" });

    await expect(
      new EnsureQueueCreationAllowedUseCase(premiumRepo, buildEnforceQueueLimits()).execute({
        organizationId: "org-2",
        currentQueueCountForBusiness: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_QUEUE_LIMIT_REACHED" });
  });

  it("allows the first queue under any plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

    await expect(
      useCase.execute({ organizationId: "org-1", currentQueueCountForBusiness: 0 }),
    ).resolves.toBeUndefined();
  });

  describe("estado de la subscription", () => {
    // EnforceQueueLimitsForOrganizationUseCase validates organizationId as a
    // UUID (unlike this use case's own schema), so this describe block —
    // the only one that reaches enforcement — needs a real UUID instead of
    // the "org-1"-style literal the rest of the file uses.
    const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    it("rejects creating a queue when the subscription is cancelled, even under the plan's count limit", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, plan: "premium", status: "cancelled" }),
      ]);
      const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

      await expect(
        useCase.execute({ organizationId: ORG_ID, currentQueueCountForBusiness: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("rejects creating a queue when the subscription is expired", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, status: "expired" }),
      ]);
      const useCase = new EnsureQueueCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

      await expect(
        useCase.execute({ organizationId: ORG_ID, currentQueueCountForBusiness: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("deactivates excess queues down to Basic when a lapsed trial is discovered here — no one else ever calls enforcement for it", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, plan: "pro", status: "expired" }),
      ]);
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: "business-1", organizationId: ORG_ID }),
      ]);
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: "q-old", businessId: "business-1", prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        buildQueue({ id: "q-new", businessId: "business-1", prefix: "B", isActive: true, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      ]);
      const useCase = new EnsureQueueCreationAllowedUseCase(
        subscriptionRepo,
        buildEnforceQueueLimits({ businessRepo, queueRepo }),
      );

      await expect(
        useCase.execute({ organizationId: ORG_ID, currentQueueCountForBusiness: 2 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });

      // Basic allows 1 active queue per business — the newer of the 2 gets deactivated.
      expect(queueRepo.all().find((q) => q.id === "q-old")?.isActive).toBe(true);
      expect(queueRepo.all().find((q) => q.id === "q-new")?.isActive).toBe(false);
    });
  });
});
