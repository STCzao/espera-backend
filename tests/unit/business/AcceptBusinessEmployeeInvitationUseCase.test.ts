import { describe, expect, it } from "vitest";

import { AcceptBusinessEmployeeInvitationUseCase } from "../../../src/modules/business/application/AcceptBusinessEmployeeInvitationUseCase";
import {
  buildBusinessEmployeeInvitation,
  buildUser,
  InMemoryBusinessEmployeeInvitationRepo,
  InMemoryBusinessEmployeeRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const validInput = {
  token: "employee-invitation-token-1234567890",
  firstName: "Employee",
  lastName: "Person",
  password: "Password1",
};

describe("AcceptBusinessEmployeeInvitationUseCase", () => {
  it("creates an employee user and active business membership", async () => {
    const userRepo = new InMemoryUserRepo();
    const employeeRepo = new InMemoryBusinessEmployeeRepo();
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({ token: validInput.token }),
    ]);
    const useCase = new AcceptBusinessEmployeeInvitationUseCase(
      invitationRepo,
      employeeRepo,
      userRepo,
    );

    const result = await useCase.execute(validInput);

    const createdUser = userRepo.all()[0];
    expect(result).toEqual({
      businessId: "business-1",
      userId: createdUser.id,
      role: "employee",
      status: "active",
    });
    expect(createdUser).toMatchObject({
      email: "employee@example.com",
      role: "employee",
      isEmailVerified: true,
    });
    expect(employeeRepo.all()[0]).toMatchObject({
      businessId: "business-1",
      userId: createdUser.id,
      status: "active",
    });
    expect(invitationRepo.all()[0]).toMatchObject({
      status: "accepted",
      acceptedUserId: createdUser.id,
      acceptedAt: expect.any(Date),
    });
  });

  it("promotes an existing user to employee when accepting an invitation", async () => {
    const existingUser = buildUser({
      id: "33333333-3333-4333-8333-333333333333",
      email: "employee@example.com",
      role: "user",
    });
    const userRepo = new InMemoryUserRepo([existingUser]);
    const employeeRepo = new InMemoryBusinessEmployeeRepo();
    const useCase = new AcceptBusinessEmployeeInvitationUseCase(
      new InMemoryBusinessEmployeeInvitationRepo([
        buildBusinessEmployeeInvitation({ token: validInput.token }),
      ]),
      employeeRepo,
      userRepo,
    );

    await useCase.execute(validInput);

    expect((await userRepo.findById(existingUser.id))?.role).toBe("employee");
    expect(employeeRepo.all()[0]).toMatchObject({
      userId: existingUser.id,
      status: "active",
    });
  });

  it("rejects expired invitations", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo([
      buildBusinessEmployeeInvitation({
        token: validInput.token,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ]);
    const useCase = new AcceptBusinessEmployeeInvitationUseCase(
      invitationRepo,
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryUserRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 400,
      code: "EMPLOYEE_INVITATION_EXPIRED",
    });
    expect(invitationRepo.all()[0].status).toBe("expired");
  });
});
