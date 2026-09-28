import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterUseCase } from "../../../src/modules/auth/application/RegisterUseCase";
import { buildUser, InMemoryUserRepo } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendVerificationEmail: emailMocks.sendVerificationEmail,
}));

const validInput = {
  email: "NEW.USER@example.com",
  password: "Password1",
  confirmPassword: "Password1",
  firstName: "Juan",
  lastName: "Pérez",
};

describe("RegisterUseCase", () => {
  beforeEach(() => {
    emailMocks.sendVerificationEmail.mockReset();
    emailMocks.sendVerificationEmail.mockResolvedValue(undefined);
  });

  it("creates an unverified local user and sends the verification email", async () => {
    const userRepo = new InMemoryUserRepo();
    const useCase = new RegisterUseCase(userRepo);

    const result = await useCase.execute(validInput);

    const created = userRepo.all()[0];
    expect(result).toEqual({ userId: created.id });
    expect(created).toMatchObject({
      email: "new.user@example.com",
      firstName: "Juan",
      lastName: "Pérez",
      role: "user",
      approvalStatus: "approved",
      authProvider: "local",
      isEmailVerified: false,
      isBlocked: false,
    });
    expect(created.passwordHash).not.toBe("Password1");
    expect(created.emailVerificationToken).toBeTruthy();
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledWith(
      "new.user@example.com",
      created.emailVerificationToken,
    );
  });

  it("rolls back the created user when sending the verification email fails", async () => {
    emailMocks.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));
    const userRepo = new InMemoryUserRepo();
    const useCase = new RegisterUseCase(userRepo);

    await expect(useCase.execute(validInput)).rejects.toMatchObject({ statusCode: 500 });

    expect(userRepo.all()).toHaveLength(0);
  });

  describe("errores", () => {
    it("throws a conflict when the email is already in use", async () => {
      const userRepo = new InMemoryUserRepo([buildUser({ email: "new.user@example.com" })]);
      const useCase = new RegisterUseCase(userRepo);

      await expect(useCase.execute(validInput)).rejects.toMatchObject({ statusCode: 409 });
    });

    it("throws 400 when passwords do not match", async () => {
      const useCase = new RegisterUseCase(new InMemoryUserRepo());

      await expect(
        useCase.execute({ ...validInput, confirmPassword: "Different1" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 for a password missing an uppercase letter", async () => {
      const useCase = new RegisterUseCase(new InMemoryUserRepo());

      await expect(
        useCase.execute({ ...validInput, password: "password1", confirmPassword: "password1" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 for a first name containing digits", async () => {
      const useCase = new RegisterUseCase(new InMemoryUserRepo());

      await expect(
        useCase.execute({ ...validInput, firstName: "Juan123" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 400 for an invalid email", async () => {
      const useCase = new RegisterUseCase(new InMemoryUserRepo());

      await expect(
        useCase.execute({ ...validInput, email: "not-an-email" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
