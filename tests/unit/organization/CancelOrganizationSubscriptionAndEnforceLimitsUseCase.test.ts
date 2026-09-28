import { describe, expect, it } from "vitest";

import { CancelOrganizationSubscriptionAndEnforceLimitsUseCase } from "../../../src/modules/organization/application/CancelOrganizationSubscriptionAndEnforceLimitsUseCase";
import { CancelOrganizationSubscriptionUseCase } from "../../../src/modules/organization/application/CancelOrganizationSubscriptionUseCase";
import { EnforceQueueLimitsForOrganizationUseCase } from "../../../src/modules/queue/application/EnforceQueueLimitsForOrganizationUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";
import { InMemoryBusinessRepo, buildBusiness } from "../../helpers/authFakes";
import { InMemoryQueueRepo, InMemoryServiceWindowRepo, buildQueue } from "../../helpers/queueFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BUSINESS_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  subscriptionRepo?: InMemorySubscriptionRepo;
  queueRepo?: InMemoryQueueRepo;
} = {}) => {
  const subscriptionRepo = options.subscriptionRepo ?? new InMemorySubscriptionRepo([
    buildSubscription({ organizationId: ORG_ID, status: "active" }),
  ]);
  const businessRepo = new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, organizationId: ORG_ID }),
  ]);
  const queueRepo = options.queueRepo ?? new InMemoryQueueRepo();
  const windowRepo = new InMemoryServiceWindowRepo();

  return {
    subscriptionRepo,
    queueRepo,
    useCase: new CancelOrganizationSubscriptionAndEnforceLimitsUseCase(
      new CancelOrganizationSubscriptionUseCase(subscriptionRepo),
      new EnforceQueueLimitsForOrganizationUseCase(businessRepo, queueRepo, windowRepo),
      subscriptionRepo,
    ),
  };
};

describe("CancelOrganizationSubscriptionAndEnforceLimitsUseCase", () => {
  it("cancels the subscription and enforces Basic limits in one call", async () => {
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-old", businessId: BUSINESS_ID, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildQueue({ id: "q-new", businessId: BUSINESS_ID, prefix: "B", isActive: true, createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    const { useCase } = buildUseCase({ queueRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, cancelledByUserId: ADMIN_ID, reason: "x" });

    expect(result.subscription.status).toBe("cancelled");
    expect(result.deactivatedQueueIds).toEqual(["q-new"]);
    expect(queueRepo.all().find((q) => q.id === "q-new")?.isActive).toBe(false);
  });

  it("still enforces limits on retry when the subscription was already cancelled by a prior attempt", async () => {
    // Simulates the exact bug this fixes: a first attempt cancelled the
    // subscription but crashed before enforcement ran.
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "cancelled" }),
    ]);
    const queueRepo = new InMemoryQueueRepo([
      buildQueue({ id: "q-old", businessId: BUSINESS_ID, prefix: "A", isActive: true, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
      buildQueue({ id: "q-new", businessId: BUSINESS_ID, prefix: "B", isActive: true, createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo, queueRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, cancelledByUserId: ADMIN_ID, reason: "x" });

    expect(result.subscription.status).toBe("cancelled");
    expect(result.deactivatedQueueIds).toEqual(["q-new"]);
  });

  it("propagates the error when the subscription is expired, not retried as cancelled", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, status: "expired" }),
    ]);
    const { useCase } = buildUseCase({ subscriptionRepo });

    await expect(
      useCase.execute({ organizationId: ORG_ID, cancelledByUserId: ADMIN_ID, reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "SUBSCRIPTION_ALREADY_CANCELLED" });
  });

  it("propagates a genuine not-found error", async () => {
    const { useCase } = buildUseCase({ subscriptionRepo: new InMemorySubscriptionRepo() });

    await expect(
      useCase.execute({ organizationId: ORG_ID, cancelledByUserId: ADMIN_ID, reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "SUBSCRIPTION_NOT_FOUND" });
  });
});
