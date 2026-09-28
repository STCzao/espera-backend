import { beforeEach, describe, expect, it, vi } from "vitest";

import { InviteBusinessEmployeeUseCase } from "../../../src/modules/business/application/InviteBusinessEmployeeUseCase";
import {
  buildBusiness,
  buildBusinessEmployee,
  buildBusinessEmployeeInvitation,
  buildUser,
  InMemoryBusinessEmployeeInvitationRepo,
  InMemoryBusinessEmployeeRepo,
  InMemoryBusinessRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendBusinessEmployeeInvitationEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendBusinessEmployeeInvitationEmail:
    emailMocks.sendBusinessEmployeeInvitationEmail,
}));

const validInput = {
  businessId: "11111111-1111-4111-8111-111111111111",
  ownerUserId: "22222222-2222-4222-8222-222222222222",
  email: "EMPLOYEE@example.com",
};

describe("InviteBusinessEmployeeUseCase", () => {
  beforeEach(() => {
    emailMocks.sendBusinessEmployeeInvitationEmail.mockResolvedValue(undefined);
  });

  it("creates a pending employee invitation for the owner business", async () => {
    const invitationRepo = new InMemoryBusinessEmployeeInvitationRepo();
    const useCase = new InviteBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "approved",
        }),
      ]),
      new InMemoryBusinessEmployeeRepo(),
      invitationRepo,
      new InMemoryUserRepo(),
    );

    const result = await useCase.execute(validInput);

    expect(result).toMatchObject({
      businessId: validInput.businessId,
      email: "employee@example.com",
      status: "pending",
    });
    expect(invitationRepo.all()).toHaveLength(1);
    expect(emailMocks.sendBusinessEmployeeInvitationEmail).toHaveBeenCalledWith(
      "employee@example.com",
      expect.any(String),
    );
  });

  it("rejects invitations from users that do not own the business", async () => {
    const useCase = new InviteBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: "different-owner",
        }),
      ]),
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryBusinessEmployeeInvitationRepo(),
      new InMemoryUserRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 403,
      code: "BUSINESS_OWNERSHIP_REQUIRED",
    });
  });

  it("rejects invitations when the business is not operating", async () => {
    const useCase = new InviteBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "suspended",
        }),
      ]),
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryBusinessEmployeeInvitationRepo(),
      new InMemoryUserRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_NOT_OPERATING",
    });
  });

  it("rejects employees that already have active access", async () => {
    const employeeUser = buildUser({
      id: "33333333-3333-4333-8333-333333333333",
      email: "employee@example.com",
      role: "employee",
    });
    const useCase = new InviteBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "approved",
        }),
      ]),
      new InMemoryBusinessEmployeeRepo([
        buildBusinessEmployee({
          businessId: validInput.businessId,
          userId: employeeUser.id,
        }),
      ]),
      new InMemoryBusinessEmployeeInvitationRepo(),
      new InMemoryUserRepo([employeeUser]),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "EMPLOYEE_ALREADY_ACTIVE",
    });
  });

  it("rejects duplicated pending invitations", async () => {
    const useCase = new InviteBusinessEmployeeUseCase(
      new InMemoryBusinessRepo([
        buildBusiness({
          id: validInput.businessId,
          ownerUserId: validInput.ownerUserId,
          status: "approved",
        }),
      ]),
      new InMemoryBusinessEmployeeRepo(),
      new InMemoryBusinessEmployeeInvitationRepo([
        buildBusinessEmployeeInvitation({
          businessId: validInput.businessId,
          email: "employee@example.com",
        }),
      ]),
      new InMemoryUserRepo(),
    );

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "EMPLOYEE_INVITATION_PENDING",
    });
  });
});
