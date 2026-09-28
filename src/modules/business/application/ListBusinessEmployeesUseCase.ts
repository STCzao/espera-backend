import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeRepo } from "../infrastructure/PostgresBusinessEmployeeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const listBusinessEmployeesSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ListBusinessEmployeesInput = z.infer<
  typeof listBusinessEmployeesSchema
>;

export interface ListBusinessEmployeesOutput {
  businessId: string;
  employees: Array<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    status: "active";
  }>;
}

export class ListBusinessEmployeesUseCase
  implements UseCase<ListBusinessEmployeesInput, ListBusinessEmployeesOutput>
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly employeeRepo: IBusinessEmployeeRepo = new PostgresBusinessEmployeeRepo(),
  ) {}

  public async execute(
    input: ListBusinessEmployeesInput,
  ): Promise<ListBusinessEmployeesOutput> {
    const parsed = listBusinessEmployeesSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to view employees for this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const employees = await this.employeeRepo.findByBusinessId(business.id);

    return {
      businessId: business.id,
      // The panel only exposes active memberships. Revoked access is retained
      // for audit/history in persistence, not for day-to-day employee lists.
      employees: employees.map((employee) => ({
        userId: employee.userId,
        email: employee.email ?? "",
        firstName: employee.firstName ?? "",
        lastName: employee.lastName ?? "",
        status: "active",
      })),
    };
  }
}
