import { describe, expect, it } from "vitest";

import { CancelBusinessEmployeeInvitationUseCase } from "../../../src/modules/business/application/CancelBusinessEmployeeInvitationUseCase";
import {
  buildBusiness,
  buildBusinessEmployeeInvitation,
  InMemoryBusinessEmployeeInvitationRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

const BUSINESS_ID   = "11111111-1111-4111-8111-111111111111";
const OWNER_ID      = "22222222-2222-4222-8222-222222222222";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  invitationRepo?: InMemoryBusinessEmployeeInvitationRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const invitationRepo = options.invitationRepo ?? new InMemoryBusinessEmployeeInvitationRepo([
    buildBusinessEmployeeInvitation({ id: INVITATION_ID, businessId: BUSINESS_ID }),
  ]);
  return { useCase: new CancelBusinessEmployeeInvitationUseCase(businessRepo, invitationRepo), invitationRepo };
};

describe("CancelBusinessEmployeeInvitationUseCase", () => {
  it("cancels a pending invitation", async () => {
    const { useCase, invitationRepo } = buildUseCase();

    const result = await useCase.execute({
      businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID,
    });

    expect(result).toEqual({ invitationId: INVITATION_ID, businessId: BUSINESS_ID, status: "revoked" });
    const stored = await invitationRepo.findById(INVITATION_ID);
    expect(stored).toMatchObject({ status: "revoked", revokedAt: expect.any(Date) });
  });

  it("blocks a later acceptance of the token — same invariant AcceptBusinessEmployeeInvitationUseCase relies on", async () => {
    const { useCase, invitationRepo } = buildUseCase();

    await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID });

    const stored = await invitationRepo.findById(INVITATION_ID);
    expect(stored?.status).not.toBe("pending");
  });

  it("throws 404 when the business does not exist", async () => {
    const { useCase } = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
  });

  it("throws 403 for a user who does not own the business", async () => {
    const businessRepo = new InMemoryBusinessRepo([
      buildBusiness({ id: BUSINESS_ID, ownerUserId: "someone-else" }),
    ]);
    const { useCase } = buildUseCase({ businessRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_OWNERSHIP_REQUIRED" });
  });

  it("throws 404 when the invitation does not exist", async () => {
    const { useCase } = buildUseCase({ invitationRepo: new InMemoryBusinessEmployeeInvitationRepo() });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "EMPLOYEE_INVITATION_NOT_FOUND" });
  });

  it("throws 404 when the invitation belongs to a different business (cross-tenant guard)", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ id: INVITATION_ID, businessId: "other-business" }),
    ]);
    const { useCase } = buildUseCase({ invitationRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "EMPLOYEE_INVITATION_NOT_FOUND" });
  });

  it("throws 409 when the invitation is already accepted", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ id: INVITATION_ID, businessId: BUSINESS_ID, status: "accepted" }),
    ]);
    const { useCase } = buildUseCase({ invitationRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "EMPLOYEE_INVITATION_NOT_PENDING" });
  });

  it("throws 409 when the invitation was already revoked", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ id: INVITATION_ID, businessId: BUSINESS_ID, status: "revoked" }),
    ]);
    const { useCase } = buildUseCase({ invitationRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: INVITATION_ID }),
    ).rejects.toMatchObject({ statusCode: 409, code: "EMPLOYEE_INVITATION_NOT_PENDING" });
  });

  it("throws 400 for an invalid invitationId", async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID, invitationId: "not-a-uuid" }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
