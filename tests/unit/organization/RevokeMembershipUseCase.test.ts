import { describe, expect, it } from "vitest";

import { RevokeMembershipUseCase } from "../../../src/modules/organization/application/RevokeMembershipUseCase";
import { InMemoryRefreshSessionRepo } from "../../helpers/authFakes";
import { InMemoryMembershipRepo, buildMembership } from "../../helpers/organizationFakes";

const ORG_ID    = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN2_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMPLOYEE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  membershipRepo?: InMemoryMembershipRepo;
  refreshSessionRepo?: InMemoryRefreshSessionRepo;
} = {}) => {
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo([
    buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
    buildMembership({ id: "m-2", userId: ADMIN2_ID, organizationId: ORG_ID, role: "admin" }),
    buildMembership({ id: "m-3", userId: EMPLOYEE_ID, organizationId: ORG_ID, role: "employee" }),
  ]);
  const refreshSessionRepo = options.refreshSessionRepo ?? new InMemoryRefreshSessionRepo();
  return { membershipRepo, refreshSessionRepo, useCase: new RevokeMembershipUseCase(membershipRepo, refreshSessionRepo) };
};

describe("RevokeMembershipUseCase", () => {
  it("revokes an employee membership and their sessions", async () => {
    const { useCase, membershipRepo, refreshSessionRepo } = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: EMPLOYEE_ID });

    expect(result.revoked).toBe(true);
    expect(membershipRepo.all().find((m) => m.userId === EMPLOYEE_ID)?.status).toBe("revoked");
    expect(refreshSessionRepo.revokedUserIds).toContain(EMPLOYEE_ID);
  });

  it("revokes one of two admins", async () => {
    const { useCase, membershipRepo } = buildUseCase();

    await useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: ADMIN2_ID });

    expect(membershipRepo.all().find((m) => m.userId === ADMIN2_ID)?.status).toBe("revoked");
  });

  it("allows an admin to step down when a co-admin remains", async () => {
    const { useCase, membershipRepo } = buildUseCase();

    await useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: ADMIN_ID });

    expect(membershipRepo.all().find((m) => m.userId === ADMIN_ID)?.status).toBe("revoked");
  });

  describe("errores", () => {
    it("throws 403 when the requester is not an active admin", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: EMPLOYEE_ID, userId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 404 when the target has no membership", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: "11111111-1111-4111-8111-111111111111" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "MEMBERSHIP_NOT_FOUND" });
    });

    it("throws 409 when revoking the last active admin (including self)", async () => {
      const membershipRepo = new InMemoryMembershipRepo([
        buildMembership({ id: "m-1", userId: ADMIN_ID, organizationId: ORG_ID, role: "admin" }),
        buildMembership({ id: "m-2", userId: ADMIN2_ID, organizationId: ORG_ID, role: "admin", status: "revoked" }),
      ]);
      const { useCase } = buildUseCase({ membershipRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: ADMIN_ID, userId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "CANNOT_REVOKE_LAST_ADMIN" });
    });
  });
});
