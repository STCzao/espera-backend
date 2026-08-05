import { describe, expect, it } from "vitest";

import { AcceptMembershipInvitationUseCase } from "../../../src/modules/organization/application/AcceptMembershipInvitationUseCase";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";
import {
  InMemoryMembershipInvitationRepo,
  InMemoryMembershipRepo,
  buildMembershipInvitation,
} from "../../helpers/organizationFakes";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "membership-invitation-token-1234567890";

const buildUseCase = (options: {
  invitationRepo?: InMemoryMembershipInvitationRepo;
  membershipRepo?: InMemoryMembershipRepo;
  userRepo?: InMemoryUserRepo;
} = {}) => {
  const invitationRepo = options.invitationRepo ?? new InMemoryMembershipInvitationRepo([
    buildMembershipInvitation({ organizationId: ORG_ID, email: "invitee@example.com", token: TOKEN, role: "employee" }),
  ]);
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo();
  const userRepo = options.userRepo ?? new InMemoryUserRepo();
  return { invitationRepo, membershipRepo, userRepo, useCase: new AcceptMembershipInvitationUseCase(invitationRepo, membershipRepo, userRepo) };
};

describe("AcceptMembershipInvitationUseCase", () => {
  it("creates a new account and an active membership when the email has no account yet", async () => {
    const { useCase, membershipRepo, userRepo } = buildUseCase();

    const result = await useCase.execute({
      token: TOKEN,
      firstName: "New",
      lastName: "Member",
      password: "Password1",
    });

    expect(result.status).toBe("active");
    expect(result.role).toBe("employee");
    expect(membershipRepo.all()).toHaveLength(1);
    expect(userRepo.all()[0].email).toBe("invitee@example.com");
  });

  it("links an existing account without touching its profile", async () => {
    const userRepo = new InMemoryUserRepo([buildUser({ id: "existing-user", email: "invitee@example.com", firstName: "Original" })]);
    const { useCase, membershipRepo } = buildUseCase({ userRepo });

    const result = await useCase.execute({ token: TOKEN });

    expect(result.userId).toBe("existing-user");
    expect(userRepo.all()[0].firstName).toBe("Original");
    expect(membershipRepo.all()[0].userId).toBe("existing-user");
  });

  it("marks the invitation as accepted", async () => {
    const { useCase, invitationRepo } = buildUseCase({
      userRepo: new InMemoryUserRepo([buildUser({ id: "existing-user", email: "invitee@example.com" })]),
    });

    await useCase.execute({ token: TOKEN });

    expect(invitationRepo.all()[0].status).toBe("accepted");
  });

  describe("errores", () => {
    it("throws 404 for an unknown token", async () => {
      const { useCase } = buildUseCase({ invitationRepo: new InMemoryMembershipInvitationRepo() });

      await expect(
        useCase.execute({ token: "0".repeat(32) }),
      ).rejects.toMatchObject({ statusCode: 404, code: "MEMBERSHIP_INVITATION_NOT_FOUND" });
    });

    it("throws 400 when the invitation has expired", async () => {
      const invitationRepo = new InMemoryMembershipInvitationRepo([
        buildMembershipInvitation({ token: TOKEN, expiresAt: new Date(Date.now() - 1000) }),
      ]);
      const { useCase } = buildUseCase({ invitationRepo });

      await expect(
        useCase.execute({ token: TOKEN }),
      ).rejects.toMatchObject({ statusCode: 400, code: "MEMBERSHIP_INVITATION_EXPIRED" });
    });

    it("throws 400 when creating a new account without the required fields", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ token: TOKEN }),
      ).rejects.toMatchObject({ statusCode: 400, code: "ACCOUNT_DETAILS_REQUIRED" });
    });
  });
});
