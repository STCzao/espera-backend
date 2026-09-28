import { describe, expect, it } from "vitest";

import { ListBusinessEmployeesUseCase } from "../../../src/modules/business/application/ListBusinessEmployeesUseCase";
import {
  buildBusiness,
  buildBusinessEmployee,
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID    = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";

const buildUseCase = (options: {
  businessRepo?: InMemoryBusinessRepo;
  employeeRepo?: InMemoryBusinessEmployeeRepo;
} = {}) => new ListBusinessEmployeesUseCase(
  options.businessRepo ?? new InMemoryBusinessRepo([buildBusiness({ id: BUSINESS_ID, ownerUserId: OWNER_ID })]),
  options.employeeRepo ?? new InMemoryBusinessEmployeeRepo(),
);

describe("ListBusinessEmployeesUseCase", () => {
  it("lists active employees for the owner business", async () => {
    const useCase = buildUseCase({
      employeeRepo: new InMemoryBusinessEmployeeRepo([
        buildBusinessEmployee({
          businessId: BUSINESS_ID,
          userId: "33333333-3333-4333-8333-333333333333",
          email: "employee@example.com",
          firstName: "Employee",
          lastName: "Person",
        }),
      ]),
    });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result).toEqual({
      businessId: BUSINESS_ID,
      employees: [
        {
          userId: "33333333-3333-4333-8333-333333333333",
          email: "employee@example.com",
          firstName: "Employee",
          lastName: "Person",
          status: "active",
        },
      ],
    });
  });

  it("returns an empty list when the business has no employees", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result).toEqual({ businessId: BUSINESS_ID, employees: [] });
  });

  it("does not list a revoked employee", async () => {
    const useCase = buildUseCase({
      employeeRepo: new InMemoryBusinessEmployeeRepo([
        buildBusinessEmployee({ businessId: BUSINESS_ID, userId: "revoked-user", status: "revoked" }),
      ]),
    });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result.employees).toHaveLength(0);
  });

  it("falls back to empty strings when the employee's user record has no name/email on file", async () => {
    const useCase = buildUseCase({
      employeeRepo: new InMemoryBusinessEmployeeRepo([
        buildBusinessEmployee({
          businessId: BUSINESS_ID,
          userId: "user-without-profile",
          email: undefined,
          firstName: undefined,
          lastName: undefined,
        }),
      ]),
    });

    const result = await useCase.execute({ businessId: BUSINESS_ID, ownerUserId: OWNER_ID });

    expect(result.employees[0]).toMatchObject({ email: "", firstName: "", lastName: "" });
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
