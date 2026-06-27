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
});
