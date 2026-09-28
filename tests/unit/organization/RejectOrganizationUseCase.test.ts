import { beforeEach, describe, expect, it, vi } from "vitest";

import { RejectOrganizationUseCase } from "../../../src/modules/organization/application/RejectOrganizationUseCase";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  buildMembership,
  buildOrganization,
} from "../../helpers/organizationFakes";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendOrganizationRejectedEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendOrganizationRejectedEmail: emailMocks.sendOrganizationRejectedEmail,
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
    useCase: new RejectOrganizationUseCase(organizationRepo, membershipRepo, userRepo),
  };
};

describe("RejectOrganizationUseCase", () => {
  beforeEach(() => {
    emailMocks.sendOrganizationRejectedEmail.mockResolvedValue(undefined);
  });

  it("rejects a pending organization and records the reason", async () => {
    const { useCase, organizationRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: ORG_ID,
      rejectedByUserId: ADMIN_ID,
      reason: "Falta legalId",
    });

    expect(result.status).toBe("rejected");
    expect(result.rejectedReason).toBe("Falta legalId");
    expect(result.rejectedAt).toBeInstanceOf(Date);
    expect(organizationRepo.all()[0].status).toBe("rejected");
  });

  it("sends the rejection email with the reason", async () => {
    const { useCase } = buildUseCase();

    await useCase.execute({ organizationId: ORG_ID, rejectedByUserId: ADMIN_ID, reason: "Datos incompletos" });

    expect(emailMocks.sendOrganizationRejectedEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Test",
      "Datos incompletos",
    );
  });

  describe("errores", () => {
    it("throws 404 when organization does not exist", async () => {
      const { useCase } = buildUseCase({ organizationRepo: new InMemoryOrganizationRepo() });

      await expect(
        useCase.execute({ organizationId: ORG_ID, rejectedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "ORGANIZATION_NOT_FOUND" });
    });

    it("throws 409 when organization is not pending", async () => {
      const organizationRepo = new InMemoryOrganizationRepo([
        buildOrganization({ id: ORG_ID, status: "approved" }),
      ]);
      const { useCase } = buildUseCase({ organizationRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, rejectedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ORGANIZATION_NOT_PENDING" });
    });

    it("throws 400 for an empty reason", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: ORG_ID, rejectedByUserId: ADMIN_ID, reason: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 for an invalid organizationId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: "not-a-uuid", rejectedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
