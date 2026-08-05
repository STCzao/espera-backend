import { describe, expect, it } from "vitest";

import { ResolveEffectiveSubscriptionStatusUseCase } from "../../../src/modules/organization/application/ResolveEffectiveSubscriptionStatusUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("ResolveEffectiveSubscriptionStatusUseCase", () => {
  it("returns null when there is no subscription for that organization", async () => {
    const result = await new ResolveEffectiveSubscriptionStatusUseCase(new InMemorySubscriptionRepo())
      .execute({ organizationId: ORG_ID });

    expect(result).toBeNull();
  });

  it("returns the subscription unchanged when it is not in trial", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "active" }),
    ]);

    const result = await new ResolveEffectiveSubscriptionStatusUseCase(subscriptionRepo)
      .execute({ organizationId: ORG_ID });

    expect(result?.status).toBe("active");
  });

  it("returns the subscription unchanged when the trial has not ended yet", async () => {
    const trialEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "trial", trialEndsAt }),
    ]);

    const result = await new ResolveEffectiveSubscriptionStatusUseCase(subscriptionRepo)
      .execute({ organizationId: ORG_ID });

    expect(result?.status).toBe("trial");
  });

  it("flips and persists a trial past trialEndsAt to expired", async () => {
    const trialEndsAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "trial", trialEndsAt }),
    ]);

    const result = await new ResolveEffectiveSubscriptionStatusUseCase(subscriptionRepo)
      .execute({ organizationId: ORG_ID });

    expect(result?.status).toBe("expired");
    expect(subscriptionRepo.all()[0].status).toBe("expired");
  });

  it("does not touch a trial with no trialEndsAt set", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "trial", trialEndsAt: null }),
    ]);

    const result = await new ResolveEffectiveSubscriptionStatusUseCase(subscriptionRepo)
      .execute({ organizationId: ORG_ID });

    expect(result?.status).toBe("trial");
  });
});
