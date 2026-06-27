import { describe, expect, it } from "vitest";

import { UpdateOrganizationSubscriptionUseCase } from "../../../src/modules/organization/application/UpdateOrganizationSubscriptionUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

describe("UpdateOrganizationSubscriptionUseCase", () => {
  it("blocks a downgrade that would leave more businesses than the new plan allows", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new UpdateOrganizationSubscriptionUseCase(subscriptionRepo);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        newPlan: "basic",
        currentBusinessCount: 3,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SUBSCRIPTION_DOWNGRADE_BLOCKED",
    });
    expect(subscriptionRepo.all()[0].plan).toBe("premium");
  });

  it("allows a downgrade when current resources fit the new plan", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new UpdateOrganizationSubscriptionUseCase(subscriptionRepo);

    const result = await useCase.execute({
      organizationId: "org-1",
      newPlan: "basic",
      currentBusinessCount: 1,
    });

    expect(result.subscription.plan).toBe("basic");
  });
});
