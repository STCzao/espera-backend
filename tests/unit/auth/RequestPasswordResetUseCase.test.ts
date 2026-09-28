import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestPasswordResetUseCase } from "../../../src/modules/auth/application/RequestPasswordResetUseCase";
import { buildUser, InMemoryUserRepo } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendPasswordResetEmail: emailMocks.sendPasswordResetEmail,
}));

describe("RequestPasswordResetUseCase", () => {
  beforeEach(() => {
    emailMocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it("creates a reset token for local accounts", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        email: "local@example.com",
        authProvider: "local",
      }),
    ]);
    const useCase = new RequestPasswordResetUseCase(userRepo);

    const result = await useCase.execute({ email: "local@example.com" });
    const updatedUser = await userRepo.findByEmail("local@example.com");

    expect(result).toEqual({
      message: "If the email is registered, we sent a password recovery link.",
    });
    expect(updatedUser?.passwordResetToken).toEqual(expect.any(String));
    expect(updatedUser?.passwordResetExpiry).toBeInstanceOf(Date);
    expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledWith(
      "local@example.com",
      expect.any(String),
    );
  });

  it("does not create a reset token for Google accounts", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        email: "google@example.com",
        authProvider: "google",
        googleId: "google-1",
        passwordHash: undefined,
      }),
    ]);
    const useCase = new RequestPasswordResetUseCase(userRepo);

    const result = await useCase.execute({ email: "google@example.com" });
    const updatedUser = await userRepo.findByEmail("google@example.com");

    expect(result).toEqual({
      message: "If the email is registered, we sent a password recovery link.",
    });
    expect(updatedUser?.passwordResetToken).toBeUndefined();
    expect(emailMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("keeps the response generic for unknown emails", async () => {
    const userRepo = new InMemoryUserRepo();
    const useCase = new RequestPasswordResetUseCase(userRepo);

    const result = await useCase.execute({ email: "missing@example.com" });

    expect(result).toEqual({
      message: "If the email is registered, we sent a password recovery link.",
    });
    expect(emailMocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
