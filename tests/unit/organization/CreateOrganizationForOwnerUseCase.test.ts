import { describe, expect, it } from "vitest";

import { CreateOrganizationForOwnerUseCase } from "../../../src/modules/organization/application/CreateOrganizationForOwnerUseCase";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  InMemorySubscriptionRepo,
  buildMembership,
} from "../../helpers/organizationFakes";

describe("CreateOrganizationForOwnerUseCase", () => {
  it("creates an Organization, a BASIC Subscription and an ADMIN Membership for a new owner", async () => {
    const organizationRepo = new InMemoryOrganizationRepo();
    const subscriptionRepo = new InMemorySubscriptionRepo();
    const membershipRepo = new InMemoryMembershipRepo();
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      membershipRepo,
      subscriptionRepo,
    );

    const result = await useCase.execute({
      ownerUserId: "user-1",
      organizationName: "Cafe Espera",
    });

    expect(result.organizationId).toBeTruthy();
    expect(organizationRepo.all()).toHaveLength(1);
    expect(subscriptionRepo.all()).toMatchObject([
      { organizationId: result.organizationId, plan: "basic" },
    ]);
    expect(membershipRepo.all()).toMatchObject([
      { userId: "user-1", organizationId: result.organizationId, role: "admin" },
    ]);
  });

  it("reuses the existing Organization when the owner already has an ADMIN membership", async () => {
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ userId: "user-1", organizationId: "existing-org", role: "admin" }),
    ]);
    const organizationRepo = new InMemoryOrganizationRepo();
    const subscriptionRepo = new InMemorySubscriptionRepo();
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      membershipRepo,
      subscriptionRepo,
    );

    const result = await useCase.execute({
      ownerUserId: "user-1",
      organizationName: "Cafe Espera 2",
    });

    expect(result.organizationId).toBe("existing-org");
    expect(organizationRepo.all()).toHaveLength(0);
  });
});
