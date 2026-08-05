import { beforeEach, describe, expect, it, vi } from "vitest";

import { InviteMembershipUseCase } from "../../../src/modules/organization/application/InviteMembershipUseCase";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";
import {
  InMemoryMembershipInvitationRepo,
  InMemoryMembershipRepo,
  buildMembership,
  buildMembershipInvitation,
} from "../../helpers/organizationFakes";

const emailMocks = vi.hoisted(() => ({ sendMembershipInvitationEmail: vi.fn() }));
vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendMembershipInvitationEmail: emailMocks.sendMembershipInvitationEmail,
}));

const ORG_ID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPLOYEE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  membershipRepo?: InMemoryMembershipRepo;
  invitationRepo?: InMemoryMembershipInvitationRepo;
  userRepo?: InMemoryUserRepo;
} = {}) => {
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo([
    buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
  ]);
  const invitationRepo = options.invitationRepo ?? new InMemoryMembershipInvitationRepo();
  const userRepo = options.userRepo ?? new InMemoryUserRepo([buildUser({ id: ADMIN_ID })]);
  return { membershipRepo, invitationRepo, userRepo, useCase: new InviteMembershipUseCase(membershipRepo, invitationRepo, userRepo) };
};

describe("InviteMembershipUseCase", () => {
  beforeEach(() => {
    emailMocks.sendMembershipInvitationEmail.mockResolvedValue(undefined);
  });

  it("creates a pending invitation and sends the email", async () => {
    const { useCase, invitationRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: ORG_ID,
      requestingUserId: ADMIN_ID,
      email: "new@example.com",
      role: "employee",
    });

    expect(result.status).toBe("pending");
    expect(invitationRepo.all()).toHaveLength(1);
    expect(emailMocks.sendMembershipInvitationEmail).toHaveBeenCalledWith("new@example.com", expect.any(String));
  });

  describe("errores", () => {
    it("throws 403 when the requester is not an active admin", async () => {
      const membershipRepo = new InMemoryMembershipRepo([
        buildMembership({ id: "m-1", userId: EMPLOYEE_ID, organizationId: ORG_ID, role: "employee" }),
      ]);
      const { useCase } = buildUseCase({ membershipRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: EMPLOYEE_ID, email: "x@example.com", role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 403 when the requester has no membership at all", async () => {
      const { useCase } = buildUseCase({ membershipRepo: new InMemoryMembershipRepo() });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, email: "x@example.com", role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 409 when the invited user already has active access", async () => {
      const userRepo = new InMemoryUserRepo([
        buildUser({ id: ADMIN_ID }),
        buildUser({ id: EMPLOYEE_ID, email: "already@example.com" }),
      ]);
      const membershipRepo = new InMemoryMembershipRepo([
        buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
        buildMembership({ id: "m-2", userId: EMPLOYEE_ID, organizationId: ORG_ID, role: "employee" }),
      ]);
      const { useCase } = buildUseCase({ membershipRepo, userRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, email: "already@example.com", role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "MEMBERSHIP_ALREADY_ACTIVE" });
    });

    it("throws 409 when there is already a pending invitation for that email", async () => {
      const invitationRepo = new InMemoryMembershipInvitationRepo([
        buildMembershipInvitation({ organizationId: ORG_ID, email: "pending@example.com", status: "pending" }),
      ]);
      const { useCase } = buildUseCase({ invitationRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, email: "pending@example.com", role: "employee" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "MEMBERSHIP_INVITATION_PENDING" });
    });
  });
});
