import { describe, expect, it } from "vitest";

import { EnsureBusinessMembershipUseCase } from "../../../src/modules/business/application/EnsureBusinessMembershipUseCase";
import {
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
  buildBusiness,
  buildBusinessEmployee,
} from "../../helpers/authFakes";

const BUSINESS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPLOYEE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STRANGER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  employeeRepo?: InMemoryBusinessEmployeeRepo;
} = {}) => {
  const businessRepo = options.businessRepo ?? new InMemoryBusinessRepo([
    buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID }),
  ]);
  const employeeRepo = options.employeeRepo ?? new InMemoryBusinessEmployeeRepo();
  return new EnsureBusinessMembershipUseCase(businessRepo, employeeRepo);
};

describe("EnsureBusinessMembershipUseCase", () => {
  it("allows the business owner", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, userId: OWNER_ID }),
    ).resolves.toBeUndefined();
  });

  it("allows an active employee of the business", async () => {
    const employeeRepo = new InMemoryBusinessEmployeeRepo([
      buildBusinessEmployee({ businessId: BUSINESS_ID, userId: EMPLOYEE_ID, status: "active" }),
    ]);
    const useCase = buildUseCase({ employeeRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, userId: EMPLOYEE_ID }),
    ).resolves.toBeUndefined();
  });

  it("rejects a revoked employee", async () => {
    const employeeRepo = new InMemoryBusinessEmployeeRepo([
      buildBusinessEmployee({ businessId: BUSINESS_ID, userId: EMPLOYEE_ID, status: "revoked" }),
    ]);
    const useCase = buildUseCase({ employeeRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, userId: EMPLOYEE_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_MEMBERSHIP_REQUIRED" });
  });

  it("rejects a user with no relation to the business at all", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, userId: STRANGER_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_MEMBERSHIP_REQUIRED" });
  });

  it("rejects an employee active at a different business", async () => {
    const OTHER_BUSINESS_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const employeeRepo = new InMemoryBusinessEmployeeRepo([
      buildBusinessEmployee({ businessId: OTHER_BUSINESS_ID, userId: EMPLOYEE_ID, status: "active" }),
    ]);
    const useCase = buildUseCase({ employeeRepo });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, userId: EMPLOYEE_ID }),
    ).rejects.toMatchObject({ statusCode: 403, code: "BUSINESS_MEMBERSHIP_REQUIRED" });
  });

  it("throws 404 when the business does not exist", async () => {
    const useCase = buildUseCase({ businessRepo: new InMemoryBusinessRepo() });

    await expect(
      useCase.execute({ businessId: BUSINESS_ID, userId: OWNER_ID }),
    ).rejects.toMatchObject({ statusCode: 404, code: "BUSINESS_NOT_FOUND" });
  });
});
