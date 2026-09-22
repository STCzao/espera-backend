import { describe, expect, it } from "vitest";

import { ChangeOrganizationSubscriptionPlanUseCase } from "../../../src/modules/organization/application/ChangeOrganizationSubscriptionPlanUseCase";
import { UpdateOrganizationSubscriptionUseCase } from "../../../src/modules/organization/application/UpdateOrganizationSubscriptionUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue, buildServiceWindow } from "../../helpers/queueFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ChangeOrganizationSubscriptionPlanUseCase", () => {
  it("computes usage from real business/queue/window data and allows a plan that fits", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_A, organizationId: ORG_ID }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BUSINESS_A, isActive: true }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: "q-1", isActive: true }),
      buildServiceWindow({ id: "w-2", queueId: "q-1", isActive: true }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "premium" }),
    ]);
    const useCase = new ChangeOrganizationSubscriptionPlanUseCase(
      businessRepo,
      queueRepo,
      windowRepo,
      new UpdateOrganizationSubscriptionUseCase(subscriptionRepo),
    );

    const result = await useCase.execute({ organizationId: ORG_ID, newPlan: "pro" });

    expect(result.subscription.plan).toBe("pro");
  });

  it("blocks a downgrade when the worst-offending queue exceeds the new plan's limits", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_A, organizationId: ORG_ID }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BUSINESS_A, isActive: true }),
    ]);
    // Basic only allows 1 active window per queue — q-1 has 2.
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: "q-1", isActive: true }),
      buildServiceWindow({ id: "w-2", queueId: "q-1", isActive: true }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "premium" }),
    ]);
    const useCase = new ChangeOrganizationSubscriptionPlanUseCase(
      businessRepo,
      queueRepo,
      windowRepo,
      new UpdateOrganizationSubscriptionUseCase(subscriptionRepo),
    );

    await expect(
      useCase.execute({ organizationId: ORG_ID, newPlan: "basic" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_DOWNGRADE_BLOCKED_WINDOWS" });
  });

  it("ignores inactive queues/windows when computing usage", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_A, organizationId: ORG_ID }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-1", businessId: BUSINESS_A, isActive: true }),
      buildQueue({ id: "q-2", businessId: BUSINESS_A, isActive: false }),
    ]);
    const windowRepo = new InMemoryServiceWindowRepo([
      buildServiceWindow({ id: "w-1", queueId: "q-1", isActive: true }),
      buildServiceWindow({ id: "w-2", queueId: "q-1", isActive: false }),
    ]);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "premium" }),
    ]);
    const useCase = new ChangeOrganizationSubscriptionPlanUseCase(
      businessRepo,
      queueRepo,
      windowRepo,
      new UpdateOrganizationSubscriptionUseCase(subscriptionRepo),
    );

    const result = await useCase.execute({ organizationId: ORG_ID, newPlan: "basic" });

    expect(result.subscription.plan).toBe("basic");
  });
});
