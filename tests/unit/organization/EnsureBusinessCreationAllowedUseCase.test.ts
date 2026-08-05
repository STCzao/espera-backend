import { describe, expect, it } from "vitest";

import { EnsureBusinessCreationAllowedUseCase } from "../../../src/modules/organization/application/EnsureBusinessCreationAllowedUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

describe("EnsureBusinessCreationAllowedUseCase", () => {
  it("rejects a second business under a BASIC plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "basic" }),
    ]);
    const useCase = new EnsureBusinessCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentBusinessCount: 1 }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PLAN_BUSINESS_LIMIT_REACHED",
    });
  });

  it("allows the first business under a BASIC plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "basic" }),
    ]);
    const useCase = new EnsureBusinessCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentBusinessCount: 0 }),
    ).resolves.toBeUndefined();
  });

  it("allows multiple businesses under a PREMIUM plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new EnsureBusinessCreationAllowedUseCase(subscriptionRepo);

    await expect(
      useCase.execute({ organizationId: "org-1", currentBusinessCount: 5 }),
    ).resolves.toBeUndefined();
  });

  describe("estado de la subscription", () => {
    it("rejects a cancelled subscription regardless of the plan's business limit", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: "org-1", plan: "premium", status: "cancelled" }),
      ]);
      const useCase = new EnsureBusinessCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentBusinessCount: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("rejects an expired subscription", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: "org-1", status: "expired" }),
      ]);
      const useCase = new EnsureBusinessCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentBusinessCount: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
    });

    it("detects a lazily-expired trial and rejects, persisting the new status", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({
          organizationId: "org-1",
          status: "trial",
          trialEndsAt: new Date(Date.now() - 1000),
        }),
      ]);
      const useCase = new EnsureBusinessCreationAllowedUseCase(subscriptionRepo);

      await expect(
        useCase.execute({ organizationId: "org-1", currentBusinessCount: 0 }),
      ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
      expect(subscriptionRepo.all()[0].status).toBe("expired");
    });
  });
});
