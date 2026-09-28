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
        maxActiveQueuesPerBusiness: 1,
        maxActiveWindowsPerQueue: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SUBSCRIPTION_DOWNGRADE_BLOCKED_BUSINESSES",
    });
    expect(subscriptionRepo.all()[0].plan).toBe("premium");
  });

  it("blocks a downgrade that would leave a business with more active queues than the new plan allows", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new UpdateOrganizationSubscriptionUseCase(subscriptionRepo);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        newPlan: "basic",
        currentBusinessCount: 1,
        maxActiveQueuesPerBusiness: 2,
        maxActiveWindowsPerQueue: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SUBSCRIPTION_DOWNGRADE_BLOCKED_QUEUES",
    });
    expect(subscriptionRepo.all()[0].plan).toBe("premium");
  });

  it("blocks a downgrade that would leave a queue with more active windows than the new plan allows", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: "org-1", plan: "premium" }),
    ]);
    const useCase = new UpdateOrganizationSubscriptionUseCase(subscriptionRepo);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        newPlan: "pro",
        currentBusinessCount: 1,
        maxActiveQueuesPerBusiness: 1,
        maxActiveWindowsPerQueue: 15,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "SUBSCRIPTION_DOWNGRADE_BLOCKED_WINDOWS",
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
      maxActiveQueuesPerBusiness: 1,
      maxActiveWindowsPerQueue: 1,
    });

    expect(result.subscription.plan).toBe("basic");
  });

  it("throws 404 when there is no subscription for that organization", async () => {
    const useCase = new UpdateOrganizationSubscriptionUseCase(new InMemorySubscriptionRepo());

    await expect(
      useCase.execute({
        organizationId: "org-1",
        newPlan: "basic",
        currentBusinessCount: 0,
        maxActiveQueuesPerBusiness: 0,
        maxActiveWindowsPerQueue: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "SUBSCRIPTION_NOT_FOUND" });
  });
});
