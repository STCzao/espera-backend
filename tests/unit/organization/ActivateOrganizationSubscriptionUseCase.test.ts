import { describe, expect, it } from "vitest";

import { ActivateOrganizationSubscriptionUseCase } from "../../../src/modules/organization/application/ActivateOrganizationSubscriptionUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ActivateOrganizationSubscriptionUseCase", () => {
  it("activates a pending subscription and records who/when", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "pending" }),
    ]);

    const result = await new ActivateOrganizationSubscriptionUseCase(subscriptionRepo).execute({
      organizationId: ORG_ID,
      activatedByUserId: ADMIN_ID,
    });

    expect(result.status).toBe("active");
    expect(result.activatedByUserId).toBe(ADMIN_ID);
    expect(result.activatedAt).toBeInstanceOf(Date);
  });

  it("activates a subscription in trial", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "trial" }),
    ]);

    const result = await new ActivateOrganizationSubscriptionUseCase(subscriptionRepo).execute({
      organizationId: ORG_ID,
      activatedByUserId: ADMIN_ID,
    });

    expect(result.status).toBe("active");
  });

  it("renews a cancelled subscription back to active, keeping the cancellation history", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({
        organizationId: ORG_ID, status: "cancelled",
        cancelledByUserId: ADMIN_ID, cancellationReason: "no renovó", cancelledAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    const result = await new ActivateOrganizationSubscriptionUseCase(subscriptionRepo).execute({
      organizationId: ORG_ID,
      activatedByUserId: ADMIN_ID,
    });

    expect(result.status).toBe("active");
    expect(result.cancellationReason).toBe("no renovó");
  });

  it("renews an expired subscription back to active", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "expired" }),
    ]);

    const result = await new ActivateOrganizationSubscriptionUseCase(subscriptionRepo).execute({
      organizationId: ORG_ID,
      activatedByUserId: ADMIN_ID,
    });

    expect(result.status).toBe("active");
  });

  describe("errores", () => {
    it("throws 404 when there is no subscription for that organization", async () => {
      const useCase = new ActivateOrganizationSubscriptionUseCase(new InMemorySubscriptionRepo());

      await expect(
        useCase.execute({ organizationId: ORG_ID, activatedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SUBSCRIPTION_NOT_FOUND" });
    });

    it("throws 409 when the subscription is already active", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, status: "active" }),
      ]);

      await expect(
        new ActivateOrganizationSubscriptionUseCase(subscriptionRepo).execute({
          organizationId: ORG_ID,
          activatedByUserId: ADMIN_ID,
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_CANNOT_BE_ACTIVATED" });
    });

  });
});
