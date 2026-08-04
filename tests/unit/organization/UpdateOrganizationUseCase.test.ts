import { describe, expect, it } from "vitest";

import { UpdateOrganizationUseCase } from "../../../src/modules/organization/application/UpdateOrganizationUseCase";
import {
  InMemoryMembershipRepo,
  InMemoryOrganizationRepo,
  buildMembership,
  buildOrganization,
} from "../../helpers/organizationFakes";

const ORG_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const buildUseCase = (options: {
  organizationRepo?: InMemoryOrganizationRepo;
  membershipRepo?: InMemoryMembershipRepo;
} = {}) => {
  const organizationRepo = options.organizationRepo ?? new InMemoryOrganizationRepo([
    buildOrganization({ id: ORG_ID }),
  ]);
  const membershipRepo = options.membershipRepo ?? new InMemoryMembershipRepo([
    buildMembership({ organizationId: ORG_ID, userId: USER_ID, role: "admin" }),
  ]);
  return { organizationRepo, membershipRepo, useCase: new UpdateOrganizationUseCase(organizationRepo, membershipRepo) };
};

describe("UpdateOrganizationUseCase", () => {
  it("sets legalId (HU-2.5.5 — editable after creation)", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: USER_ID, legalId: "30-12345678-9" });

    expect(result.legalId).toBe("30-12345678-9");
  });

  it("updates the name", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: USER_ID, name: "Nuevo Nombre" });

    expect(result.name).toBe("Nuevo Nombre");
  });

  it("does not modify approval status", async () => {
    const organizationRepo = new InMemoryOrganizationRepo([
      buildOrganization({ id: ORG_ID, status: "approved" }),
    ]);
    const { useCase } = buildUseCase({ organizationRepo });

    const result = await useCase.execute({ organizationId: ORG_ID, requestingUserId: USER_ID, legalId: "30-1" });

    expect(result.status).toBe("approved");
  });

  describe("errores", () => {
    it("throws 404 when organization does not exist", async () => {
      const { useCase } = buildUseCase({ organizationRepo: new InMemoryOrganizationRepo() });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: USER_ID, legalId: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "ORGANIZATION_NOT_FOUND" });
    });

    it("throws 403 when requester has no membership in the organization", async () => {
      const { useCase } = buildUseCase({ membershipRepo: new InMemoryMembershipRepo() });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: USER_ID, legalId: "x" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 403 when requester is an employee, not admin", async () => {
      const membershipRepo = new InMemoryMembershipRepo([
        buildMembership({ organizationId: ORG_ID, userId: USER_ID, role: "employee" }),
      ]);
      const { useCase } = buildUseCase({ membershipRepo });

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: USER_ID, legalId: "x" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 403 when requester belongs to a different organization", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: ORG_ID, requestingUserId: OTHER_USER_ID, legalId: "x" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "ORGANIZATION_OWNERSHIP_REQUIRED" });
    });

    it("throws 400 for an invalid organizationId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ organizationId: "not-a-uuid", requestingUserId: USER_ID, legalId: "x" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
