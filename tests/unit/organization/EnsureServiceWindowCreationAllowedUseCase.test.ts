import { describe, expect, it } from "vitest";

import { EnsureServiceWindowCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureServiceWindowCreationAllowedUseCase";
import { EnforceQueueLimitsForOrganizationUseCase } from "../../../src/modules/queue/application/EnforceQueueLimitsForOrganizationUseCase";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue, buildServiceWindow } from "../../helpers/queueFakes";

const buildEnforceQueueLimits = (options: {
  businessRepo?: InMemoryBusinessRepo;
  queueRepo?: InMemoryQueueRepo;
  windowRepo?: InMemoryServiceWindowRepo;
} = {}) => new EnforceQueueLimitsForOrganizationUseCase(
  options.businessRepo ?? new InMemoryBusinessRepo(),
  options.queueRepo ?? new InMemoryQueueRepo(),
  options.windowRepo ?? new InMemoryServiceWindowRepo(),
);

describe("EnsureServiceWindowCreationAllowedUseCase", () => {
  it("rejects a second service window under a BASIC plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "basic" }),
    ]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

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
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

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
      new EnsureServiceWindowCreationAllowedUseCase(proRepo, buildEnforceQueueLimits()).execute({
        organizationId: "org-1",
        currentServiceWindowCountForQueue: 9,
      }),
    ).resolves.toBeUndefined();

    await expect(
      new EnsureServiceWindowCreationAllowedUseCase(premiumRepo, buildEnforceQueueLimits()).execute({
        organizationId: "org-2",
        currentServiceWindowCountForQueue: 19,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects the 21st service window under a PREMIUM plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

    await expect(
      useCase.execute({ organizationId: "org-1", currentServiceWindowCountForQueue: 20 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED",
    });
  });

  it("defaults to basic when the organization has no subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([]);
    const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

    await expect(
      useCase.execute({ organizationId: "org-without-subscription", currentServiceWindowCountForQueue: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PLAN_SERVICE_WINDOW_LIMIT_REACHED" });
  });

  describe("estado de la subscription", () => {
    // EnforceQueueLimitsForOrganizationUseCase validates organizationId as a
    // UUID (unlike this use case's own schema), so this describe block —
    // the only one that reaches enforcement — needs a real UUID instead of
    // the "org-1"-style literal the rest of the file uses.
    const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    it("rejects creating a service window when the subscription is cancelled, even under the plan's count limit", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, plan: "premium", status: "cancelled" }),
      ]);
      const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

      await expect(
        useCase.execute({ organizationId: ORG_ID, currentServiceWindowCountForQueue: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("rejects creating a service window when the subscription is expired", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, status: "expired" }),
      ]);
      const useCase = new EnsureServiceWindowCreationAllowedUseCase(subscriptionRepo, buildEnforceQueueLimits());

      await expect(
        useCase.execute({ organizationId: ORG_ID, currentServiceWindowCountForQueue: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("deactivates excess windows down to Basic when a lapsed trial is discovered here — no one else ever calls enforcement for it", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, plan: "pro", status: "expired" }),
      ]);
      const businessRepo = new InMemoryBusinessRepo([
        buildBusiness({ id: "business-1", organizationId: ORG_ID }),
      ]);
      const queueRepo = new InMemoryQueueRepo([
        buildQueue({ id: "queue-1", businessId: "business-1", prefix: "A", isActive: true }),
      ]);
      const windowRepo = new InMemoryServiceWindowRepo([
        buildServiceWindow({ id: "w-old", queueId: "queue-1", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
        buildServiceWindow({ id: "w-new", queueId: "queue-1", isActive: true, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
      ]);
      const useCase = new EnsureServiceWindowCreationAllowedUseCase(
        subscriptionRepo,
        buildEnforceQueueLimits({ businessRepo, queueRepo, windowRepo }),
      );

      await expect(
        useCase.execute({ organizationId: ORG_ID, currentServiceWindowCountForQueue: 2 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });

      // Basic allows 1 active window per queue — the newer of the 2 gets deactivated.
      expect(windowRepo.all().find((w) => w.id === "w-old")?.isActive).toBe(true);
      expect(windowRepo.all().find((w) => w.id === "w-new")?.isActive).toBe(false);
    });
  });
});
