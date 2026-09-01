import { describe, expect, it } from "vitest";

import { VerifyEmailUseCase } from "../../../src/modules/auth/application/VerifyEmailUseCase";
import { buildUser, InMemoryUserRepo } from "../../helpers/authFakes";

describe("VerifyEmailUseCase", () => {
  it("verifies an email and clears verification fields", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        isEmailVerified: false,
        emailVerificationToken: "verification-token",
        emailVerificationExpiry: new Date(Date.now() + 60_000),
      }),
    ]);
    const useCase = new VerifyEmailUseCase(userRepo);

    const result = await useCase.execute({ token: "verification-token" });
    const updatedUser = await userRepo.findById("user-1");

    expect(result).toEqual({ message: "Email verified successfully." });
    expect(updatedUser?.isEmailVerified).toBe(true);
    expect(updatedUser?.emailVerificationToken).toBeUndefined();
    expect(updatedUser?.emailVerificationExpiry).toBeUndefined();
  });

  it("rejects an empty token", async () => {
    const useCase = new VerifyEmailUseCase(new InMemoryUserRepo());

    await expect(useCase.execute({ token: "" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid verification token.",
    });
  });

  it("rejects a token with no matching user", async () => {
    const useCase = new VerifyEmailUseCase(new InMemoryUserRepo());

    await expect(useCase.execute({ token: "never-issued-token" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid verification token.",
    });
  });

  it("rejects expired verification tokens", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        isEmailVerified: false,
        emailVerificationToken: "expired-token",
        emailVerificationExpiry: new Date(Date.now() - 60_000),
      }),
    ]);
    const useCase = new VerifyEmailUseCase(userRepo);

    await expect(
      useCase.execute({ token: "expired-token" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Verification token has expired. Please request a new one.",
    });
  });
});
