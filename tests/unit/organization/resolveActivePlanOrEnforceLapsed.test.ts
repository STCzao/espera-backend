import { describe, expect, it } from "vitest";

import { resolveActivePlanOrEnforceLapsed } from "../../../src/modules/organization/application/resolveActivePlanOrEnforceLapsed";
import { EnforceQueueLimitsForOrganizationUseCase } from "../../../src/modules/queue/application/EnforceQueueLimitsForOrganizationUseCase";
import { InMemoryBusinessRepo } from "../../helpers/authFakes";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo } from "../../helpers/queueFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const buildEnforceQueueLimits = () =>
  new EnforceQueueLimitsForOrganizationUseCase(
    new InMemoryBusinessRepo(),
    new InMemoryQueueRepo(),
    new InMemoryServiceWindowRepo(),
  );

describe("resolveActivePlanOrEnforceLapsed", () => {
  it("returns the subscription's plan when it's active", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "pro", status: "active" }),
    ]);

    const plan = await resolveActivePlanOrEnforceLapsed(ORG_ID, subscriptionRepo, buildEnforceQueueLimits());

    expect(plan).toBe("pro");
  });

  it("defaults to basic when there is no subscription at all", async () => {
    const plan = await resolveActivePlanOrEnforceLapsed(
      ORG_ID,
      new InMemorySubscriptionRepo(),
      buildEnforceQueueLimits(),
    );

    expect(plan).toBe("basic");
  });

  it("throws SUBSCRIPTION_INACTIVE for a cancelled subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "premium", status: "cancelled" }),
    ]);

    await expect(
      resolveActivePlanOrEnforceLapsed(ORG_ID, subscriptionRepo, buildEnforceQueueLimits()),
    ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
  });

  it("throws SUBSCRIPTION_INACTIVE for an expired subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "premium", status: "expired" }),
    ]);

    await expect(
      resolveActivePlanOrEnforceLapsed(ORG_ID, subscriptionRepo, buildEnforceQueueLimits()),
    ).rejects.toMatchObject({ statusCode: 403, code: "SUBSCRIPTION_INACTIVE" });
  });
});
