import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { ResetPasswordUseCase } from "../../../src/modules/auth/application/ResetPasswordUseCase";
import {
  buildUser,
  InMemoryRefreshSessionRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

describe("ResetPasswordUseCase", () => {
  it("updates the password and revokes active sessions", async () => {
    const user = buildUser({
      passwordHash: await bcrypt.hash("OldPassword1", 12),
      passwordResetToken: "reset-token",
      passwordResetExpiry: new Date(Date.now() + 60_000),
    });
    const userRepo = new InMemoryUserRepo([user]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new ResetPasswordUseCase(userRepo, refreshSessionRepo);

    const result = await useCase.execute({
      token: "reset-token",
      password: "NewPassword1",
      confirmPassword: "NewPassword1",
    });

    const updatedUser = await userRepo.findById(user.id);
    expect(result).toEqual({ message: "Password updated successfully." });
    expect(refreshSessionRepo.revokedUserIds).toEqual([user.id]);
    expect(updatedUser?.passwordResetToken).toBeUndefined();
    expect(updatedUser?.passwordResetExpiry).toBeUndefined();
    expect(updatedUser?.passwordResetUsedAt).toBeInstanceOf(Date);
    expect(
      await bcrypt.compare("NewPassword1", updatedUser?.passwordHash ?? ""),
    ).toBe(true);
  });

  it("rejects expired reset tokens", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        passwordResetToken: "expired-token",
        passwordResetExpiry: new Date(Date.now() - 60_000),
      }),
    ]);
    const useCase = new ResetPasswordUseCase(
      userRepo,
      new InMemoryRefreshSessionRepo(),
    );

    await expect(
      useCase.execute({
        token: "expired-token",
        password: "NewPassword1",
        confirmPassword: "NewPassword1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired password reset link.",
    });
  });

  it("rejects reset tokens for Google accounts", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        authProvider: "google",
        googleId: "google-1",
        passwordResetToken: "google-token",
        passwordResetExpiry: new Date(Date.now() + 60_000),
      }),
    ]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new ResetPasswordUseCase(userRepo, refreshSessionRepo);

    await expect(
      useCase.execute({
        token: "google-token",
        password: "NewPassword1",
        confirmPassword: "NewPassword1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid or expired password reset link.",
    });

    expect(refreshSessionRepo.revokedUserIds).toEqual([]);
  });
});
