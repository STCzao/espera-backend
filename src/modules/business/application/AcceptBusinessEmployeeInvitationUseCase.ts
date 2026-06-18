import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { z } from "zod";

import type { IUserRepo } from "@modules/auth/public-api";
import { PostgresUserRepo } from "@modules/auth/public-api";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessEmployeeInvitationRepo } from "../domain/IBusinessEmployeeInvitationRepo";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";
import { PostgresBusinessEmployeeInvitationRepo } from "../infrastructure/PostgresBusinessEmployeeInvitationRepo";
import { PostgresBusinessEmployeeRepo } from "../infrastructure/PostgresBusinessEmployeeRepo";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const acceptBusinessEmployeeInvitationSchema = z.object({
  token: z.string().min(32, "Invalid employee invitation token."),
  firstName: z.string().trim().min(2, "First name is required.").max(50),
  lastName: z.string().trim().min(2, "Last name is required.").max(50),
  password: z
    .string({ required_error: "Password is required." })
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must not exceed 72 characters.")
    .regex(
      passwordRegex,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number.",
    ),
});

export type AcceptBusinessEmployeeInvitationInput = z.infer<
  typeof acceptBusinessEmployeeInvitationSchema
>;

export interface AcceptBusinessEmployeeInvitationOutput {
  businessId: string;
  userId: string;
  role: "employee";
  invitationStatus: "accepted";
}

export class AcceptBusinessEmployeeInvitationUseCase
  implements
    UseCase<
      AcceptBusinessEmployeeInvitationInput,
      AcceptBusinessEmployeeInvitationOutput
    >
{
  public constructor(
    private readonly invitationRepo: IBusinessEmployeeInvitationRepo = new PostgresBusinessEmployeeInvitationRepo(),
    private readonly employeeRepo: IBusinessEmployeeRepo = new PostgresBusinessEmployeeRepo(),
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(
    input: AcceptBusinessEmployeeInvitationInput,
  ): Promise<AcceptBusinessEmployeeInvitationOutput> {
    const parsed = acceptBusinessEmployeeInvitationSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const invitation = await this.invitationRepo.findByToken(parsed.data.token);
    if (!invitation || invitation.status !== "pending") {
      throw AppError.notFound(
        "Employee invitation not found.",
        "EMPLOYEE_INVITATION_NOT_FOUND",
      );
    }

    if (invitation.expiresAt <= new Date()) {
      // Persist expiry on first use so future attempts get a stable terminal
      // state instead of recalculating from time on every request.
      await this.invitationRepo.save({
        ...invitation,
        status: "expired",
        updatedAt: new Date(),
      });
      throw AppError.badRequest(
        "Employee invitation has expired.",
        "EMPLOYEE_INVITATION_EXPIRED",
      );
    }

    const existingUser = await this.userRepo.findByEmail(invitation.email);
    if (
      existingUser &&
      (existingUser.role === "business_admin" || existingUser.role === "super_admin")
    ) {
      throw AppError.conflict(
        "Business admin accounts cannot accept employee invitations.",
        "EMPLOYEE_INVITATION_ROLE_CONFLICT",
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    // Existing customer accounts can become employees, but admin accounts are
    // intentionally excluded above to avoid collapsing owner/admin boundaries.
    const user = existingUser
      ? await this.userRepo.save({
          ...existingUser,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          passwordHash: existingUser.passwordHash ?? passwordHash,
          role: "employee",
          approvalStatus: "approved",
          isEmailVerified: true,
          updatedAt: new Date(),
        })
      : await this.userRepo.save({
          id: randomUUID(),
          email: invitation.email,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          passwordHash,
          role: "employee",
          approvalStatus: "approved",
          authProvider: "local",
          isEmailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

    // Re-accepting after a previous revocation reactivates the scoped
    // membership because the repository upserts on business + user.
    const employee = await this.employeeRepo.save({
      id: randomUUID(),
      businessId: invitation.businessId,
      userId: user.id,
      status: "active",
      invitedByUserId: invitation.invitedByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.invitationRepo.save({
      ...invitation,
      status: "accepted",
      acceptedUserId: user.id,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      businessId: employee.businessId,
      userId: user.id,
      role: "employee",
      invitationStatus: "accepted",
    };
  }
}
