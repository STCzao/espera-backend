import { describe, expect, it } from "vitest";

import { CancelOrganizationSubscriptionUseCase } from "../../../src/modules/organization/application/CancelOrganizationSubscriptionUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("CancelOrganizationSubscriptionUseCase", () => {
  it("cancels an active subscription and records who/when/why", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "active" }),
    ]);

    const result = await new CancelOrganizationSubscriptionUseCase(subscriptionRepo).execute({
      organizationId: ORG_ID,
      cancelledByUserId: ADMIN_ID,
      reason: "Pidió baja por email",
    });

    expect(result.status).toBe("cancelled");
    expect(result.cancelledByUserId).toBe(ADMIN_ID);
    expect(result.cancellationReason).toBe("Pidió baja por email");
    expect(result.cancelledAt).toBeInstanceOf(Date);
  });

  it("cancels a pending or trial subscription too", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "trial" }),
    ]);

    const result = await new CancelOrganizationSubscriptionUseCase(subscriptionRepo).execute({
      organizationId: ORG_ID,
      cancelledByUserId: ADMIN_ID,
      reason: "x",
    });

    expect(result.status).toBe("cancelled");
  });

  describe("errores", () => {
    it("throws 404 when there is no subscription for that organization", async () => {
      const useCase = new CancelOrganizationSubscriptionUseCase(new InMemorySubscriptionRepo());

      await expect(
        useCase.execute({ organizationId: ORG_ID, cancelledByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SUBSCRIPTION_NOT_FOUND" });
    });

    it("throws 409 when already cancelled", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, status: "cancelled" }),
      ]);

      await expect(
        new CancelOrganizationSubscriptionUseCase(subscriptionRepo).execute({
          organizationId: ORG_ID,
          cancelledByUserId: ADMIN_ID,
          reason: "x",
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_ALREADY_CANCELLED" });
    });

    it("throws 409 when expired", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, status: "expired" }),
      ]);

      await expect(
        new CancelOrganizationSubscriptionUseCase(subscriptionRepo).execute({
          organizationId: ORG_ID,
          cancelledByUserId: ADMIN_ID,
          reason: "x",
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_ALREADY_CANCELLED" });
    });

    it("throws 400 for an empty reason", async () => {
      const subscriptionRepo = new InMemorySubscriptionRepo([
        buildSubscription({ organizationId: ORG_ID, status: "active" }),
      ]);

      await expect(
        new CancelOrganizationSubscriptionUseCase(subscriptionRepo).execute({
          organizationId: ORG_ID,
          cancelledByUserId: ADMIN_ID,
          reason: "",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
