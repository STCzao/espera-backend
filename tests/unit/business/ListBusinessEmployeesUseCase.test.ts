import { describe, expect, it } from "vitest";

import { ListBusinessEmployeesUseCase } from "../../../src/modules/business/application/ListBusinessEmployeesUseCase";
import {
  buildBusiness,
  buildBusinessEmployee,
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
} from "../../helpers/authFakes";

describe("ListBusinessEmployeesUseCase", () => {
  it("lists active employees for the owner business", async () => {
    const businessId = "11111111-1111-4111-8111-111111111111";
    const ownerUserId = "22222222-2222-4222-8222-222222222222";
    const useCase = new ListBusinessEmployeesUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: businessId,
          ownerUserId,
        }),
      ]),
      new InMemoryBusinessEmployeeRepo([
        buildBusinessEmployee({
          businessId,
          userId: "33333333-3333-4333-8333-333333333333",
          email: "employee@example.com",
          firstName: "Employee",
          lastName: "Person",
        }),
      ]),
    );

    const result = await useCase.execute({ businessId, ownerUserId });

    expect(result).toEqual({
      businessId,
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
});
