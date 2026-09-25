import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { CreateOrganizationForOwnerUseCase } from "../../../src/modules/organization/application/CreateOrganizationForOwnerUseCase";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  InMemorySubscriptionRepo,
  buildMembership,
} from "../../helpers/organizationFakes";
import { InMemoryUnitOfWork } from "../../helpers/unitOfWorkFakes";

describe("CreateOrganizationForOwnerUseCase", () => {
  it("creates an Organization, a BASIC Subscription and an ADMIN Membership for a new owner", async () => {
    const organizationRepo = new InMemoryOrganizationRepo();
    const subscriptionRepo = new InMemorySubscriptionRepo();
    const membershipRepo = new InMemoryMembershipRepo();
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      membershipRepo,
      subscriptionRepo,
      new InMemoryUnitOfWork(),
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

  it("sets legalId on the new Organization when provided", async () => {
    const organizationRepo = new InMemoryOrganizationRepo();
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      new InMemoryMembershipRepo(),
      new InMemorySubscriptionRepo(),
      new InMemoryUnitOfWork(),
    );

    await useCase.execute({
      ownerUserId: "user-1",
      organizationName: "Cafe Espera",
      legalId: "30-12345678-9",
    });

    expect(organizationRepo.all()).toMatchObject([{ legalId: "30-12345678-9" }]);
  });

  it("leaves legalId unset when not provided", async () => {
    const organizationRepo = new InMemoryOrganizationRepo();
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      new InMemoryMembershipRepo(),
      new InMemorySubscriptionRepo(),
      new InMemoryUnitOfWork(),
    );

    await useCase.execute({ ownerUserId: "user-1", organizationName: "Cafe Espera" });

    expect(organizationRepo.all()[0].legalId).toBeUndefined();
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
      new InMemoryUnitOfWork(),
    );

    const result = await useCase.execute({
      ownerUserId: "user-1",
      organizationName: "Cafe Espera 2",
    });

    expect(result.organizationId).toBe("existing-org");
    expect(organizationRepo.all()).toHaveLength(0);
  });

  it("ignores legalId when reusing an existing Organization — PATCH /organizations/:id is the only way to change it after creation", async () => {
    const membershipRepo = new InMemoryMembershipRepo([
      buildMembership({ userId: "user-1", organizationId: "existing-org", role: "admin" }),
    ]);
    const organizationRepo = new InMemoryOrganizationRepo();
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      membershipRepo,
      new InMemorySubscriptionRepo(),
      new InMemoryUnitOfWork(),
    );

    await useCase.execute({
      ownerUserId: "user-1",
      organizationName: "Cafe Espera 2",
      legalId: "30-12345678-9",
    });

    expect(organizationRepo.all()).toHaveLength(0);
  });

  it("propagates a failure from the last write instead of returning a fake success", async () => {
    const organizationRepo = new InMemoryOrganizationRepo();
    const subscriptionRepo = new InMemorySubscriptionRepo();
    const failingMembershipRepo: InMemoryMembershipRepo = Object.assign(
      new InMemoryMembershipRepo(),
      { save: async () => { throw new Error("boom"); } },
    );
    const useCase = new CreateOrganizationForOwnerUseCase(
      organizationRepo,
      failingMembershipRepo,
      subscriptionRepo,
      new InMemoryUnitOfWork(),
    );

    await expect(
      useCase.execute({ ownerUserId: "user-1", organizationName: "Cafe Espera" }),
    ).rejects.toThrow("boom");
  });

  it("reuses the winner's organization when a concurrent registration hits the unique ADMIN index (P2002)", async () => {
    const membershipRepo = new InMemoryMembershipRepo();
    const realSave = membershipRepo.save.bind(membershipRepo);
    membershipRepo.save = async (entity, tx) => {
      // The concurrent request commits its membership first, then ours collides.
      await realSave(buildMembership({ userId: "user-1", organizationId: "org-winner", role: "admin" }));
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    };
    const useCase = new CreateOrganizationForOwnerUseCase(
      new InMemoryOrganizationRepo(),
      membershipRepo,
      new InMemorySubscriptionRepo(),
      new InMemoryUnitOfWork(),
    );

    const result = await useCase.execute({ ownerUserId: "user-1", organizationName: "Cafe Espera" });

    expect(result.organizationId).toBe("org-winner");
  });
});
