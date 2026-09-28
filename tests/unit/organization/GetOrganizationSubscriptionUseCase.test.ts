import { describe, expect, it } from "vitest";

import { GetOrganizationSubscriptionUseCase } from "../../../src/modules/organization/application/GetOrganizationSubscriptionUseCase";
import { InMemorySubscriptionRepo, buildSubscription } from "../../helpers/organizationFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GetOrganizationSubscriptionUseCase", () => {
  it("returns the organization's subscription", async () => {
    const subscriptionRepo = new InMemorySubscriptionRepo([
      buildSubscription({ organizationId: ORG_ID, plan: "pro" }),
    ]);

    const result = await new GetOrganizationSubscriptionUseCase(subscriptionRepo).execute({ organizationId: ORG_ID });

    expect(result.plan).toBe("pro");
  });

  describe("errores", () => {
    it("throws 404 when there is no subscription for that organization", async () => {
      const useCase = new GetOrganizationSubscriptionUseCase(new InMemorySubscriptionRepo());

      await expect(
        useCase.execute({ organizationId: ORG_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "SUBSCRIPTION_NOT_FOUND" });
    });

    it("throws 400 for an invalid organizationId", async () => {
      const useCase = new GetOrganizationSubscriptionUseCase(new InMemorySubscriptionRepo());

      await expect(
        useCase.execute({ organizationId: "not-a-uuid" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
