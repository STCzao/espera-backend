import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApproveOrganizationUseCase } from "../../../src/modules/organization/application/ApproveOrganizationUseCase";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  buildMembership,
  buildOrganization,
} from "../../helpers/organizationFakes";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendOrganizationApprovedEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendOrganizationApprovedEmail: emailMocks.sendOrganizationApprovedEmail,
}));

const ORG_ID   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  organizationRepo?: InMemoryOrganizationRepo;
  membershipRepo?: InMemoryMembershipRepo;
  userRepo?: InMemoryUserRepo;
} = {}) => {
  const organizationRepo = options.organizationRepo ?? new InMemoryOrganizationRepo([
    buildOrganization({ id: ORG_ID, status: "pending" }),
  ]);
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo([
    buildMembership({ organizationId: ORG_ID, userId: "user-1", role: "admin" }),
  ]);
  const userRepo = options.userRepo ?? new InMemoryUserRepo([buildUser({ id: "user-1" })]);
  return {
    organizationRepo, membershipRepo, userRepo,
    useCase: new ApproveOrganizationUseCase(organizationRepo, membershipRepo, userRepo),
  };
};

describe("ApproveOrganizationUseCase", () => {
  beforeEach(() => {
    emailMocks.sendOrganizationApprovedEmail.mockResolvedValue(undefined);
  });

  it("approves a pending organization and records who/when", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID });

    expect(result.status).toBe("approved");
    expect(result.approvedByUserId).toBe(ADMIN_ID);
    expect(result.approvedAt).toBeInstanceOf(Date);
  });

  it("approves a previously rejected organization (correction path)", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, status: "rejected", rejectedReason: "Falta legalId" }),
    ]);
    const { useCase } = buildUseCase({ organizationRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID });

    expect(result.status).toBe("approved");
    expect(result.rejectedReason).toBeUndefined();
  });

  it("does not touch any Business (organization approval is independent)", async () => {
    const { useCase, organizationRepo } = buildUseCase();

    await useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID });

    expect(organizationRepo.all()[0].status).toBe("approved");
  });

  it("sends the approval email to the organization's admin member", async () => {
    const { useCase } = buildUseCase();

    await useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID });

    expect(emailMocks.sendOrganizationApprovedEmail).toHaveBeenCalledWith("user@example.com", "Test");
  });

  it("completes approval even when no admin membership is found", async () => {
    const { useCase } = buildUseCase({ membershipRepo: new InMemoryMembershipRepo() });

    await expect(
      useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID }),
    ).resolves.toMatchObject({ status: "approved" });
    expect(emailMocks.sendOrganizationApprovedEmail).not.toHaveBeenCalled();
  });

  describe("errores", () => {
    it("throws 404 when organization does not exist", async () => {
      const { useCase } = buildUseCase({ organizationRepo: new InMemoryOrganizationRepo() });

      await expect(
        useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "ORGANIZATION_NOT_FOUND" });
    });

    it("throws 409 when already approved", async () => {
      const organizationRepo = new InMemoryOrganizationRepo([
        buildOrganization({ id: ORG_ID, status: "approved" }),
      ]);
      const { useCase } = buildUseCase({ organizationRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORGANIZATION_ALREADY_APPROVED" });
    });

    it("throws 400 for an invalid organizationId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: "not-a-uuid", approvedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
