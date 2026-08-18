import { describe, expect, it } from "vitest";

import { ListPendingBusinessEmployeeInvitationsUseCase } from "../../../src/modules/business/application/ListPendingBusinessEmployeeInvitationsUseCase";
import {
  InMemoryBusinessEmployeeInvitationRepo,
  InMemoryBusinessRepo,
  buildBusiness,
  buildBusinessEmployeeInvitation,
} from "../../helpers/authFakes";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  invitationRepo?: InMemoryBusinessEmployeeInvitationRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const invitationRepo = options.invitationRepo ?? new InMemoryBusinessEmployeeInvitationRepo();
  return new ListPendingBusinessEmployeeInvitationsUseCase(businessRepo, invitationRepo);
};

describe("ListPendingBusinessEmployeeInvitationsUseCase", () => {
  it("returns pending invitations for the business", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ id: "inv-1", businessId: BUSINESS_ID, email: "empleado@example.com" }),
    ]);
    const useCase = buildUseCase({ invitationRepo });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result.businessId).toBe(BUSINESS_ID);
    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]).toMatchObject({ invitationId: "inv-1", email: "empleado@example.com" });
  });

  it("excludes accepted and revoked invitations", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ id: "inv-accepted", businessId: BUSINESS_ID, status: "accepted" }),
      buildBusinessEmployeeInvitation({ id: "inv-revoked", businessId: BUSINESS_ID, status: "revoked" }),
    ]);
    const useCase = buildUseCase({ invitationRepo });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result.invitations).toHaveLength(0);
  });

  it("excludes invitations that expired, even if still marked pending in storage", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({
        id: "inv-expired",
        businessId: BUSINESS_ID,
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ]);
    const useCase = buildUseCase({ invitationRepo });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result.invitations).toHaveLength(0);
  });

  it("excludes invitations from other businesses", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ id: "inv-other", businessId: "other-business" }),
    ]);
    const useCase = buildUseCase({ invitationRepo });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result.invitations).toHaveLength(0);
  });

  describe("errores", () => {
    it("throws 404 when the business does not exist", async () => {
      const useCase = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
    });

    it("throws 403 when the requester does not own the business", async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OTHER_USER_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
    });

    it("throws 400 for an invalid businessId", async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute({ businessId: "not-a-uuid", ownerUserId: OWNER_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
