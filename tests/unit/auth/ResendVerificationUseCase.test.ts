import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResendVerificationUseCase } from "../../../src/modules/auth/application/ResendVerificationUseCase";
import { buildUser, InMemoryUserRepo } from "../../helpers/authFakes";

const emailMocks = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/email", () => ({
  sendVerificationEmail: emailMocks.sendVerificationEmail,
}));

const EMAIL = "user@example.com";

describe("ResendVerificationUseCase", () => {
  beforeEach(() => {
    emailMocks.sendVerificationEmail.mockReset();
    emailMocks.sendVerificationEmail.mockResolvedValue(undefined);
  });

  it("issues a new verification token and sends it", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ email: EMAIL, isEmailVerified: false, emailVerificationToken: "old-token" }),
    ]);
    const useCase = new ResendVerificationUseCase(userRepo);

    const result = await useCase.execute({ email: EMAIL });

    expect(result).toEqual({ message: "Verification email resent." });
    const updated = await userRepo.findByEmail(EMAIL);
    expect(updated?.emailVerificationToken).not.toBe("old-token");
    expect(updated?.lastVerificationSentAt).toBeInstanceOf(Date);
    expect(emailMocks.sendVerificationEmail).toHaveBeenCalledWith(
      EMAIL,
      updated?.emailVerificationToken,
    );
  });

  it("does not enforce a cooldown when no email was sent before", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ email: EMAIL, isEmailVerified: false, lastVerificationSentAt: undefined }),
    ]);
    const useCase = new ResendVerificationUseCase(userRepo);

    await expect(useCase.execute({ email: EMAIL })).resolves.toEqual({
      message: "Verification email resent.",
    });
  });

  describe("errores", () => {
    it("throws 400 with a generic message when the email does not exist (no account enumeration)", async () => {
      const useCase = new ResendVerificationUseCase(new InMemoryUserRepo());

      await expect(useCase.execute({ email: "nobody@example.com" })).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid token.",
      });
    });

    it("throws 400 when the email is already verified", async () => {
      const userRepo = new InMemoryUserRepo([buildUser({ email: EMAIL, isEmailVerified: true })]);
      const useCase = new ResendVerificationUseCase(userRepo);

      await expect(useCase.execute({ email: EMAIL })).rejects.toMatchObject({
        statusCode: 400,
        message: "Email is already verified.",
      });
    });

    it("throws 429 when requested again within the 5-minute cooldown", async () => {
      const userRepo = new InMemoryUserRepo([
        buildUser({ email: EMAIL, isEmailVerified: false, lastVerificationSentAt: new Date() }),
      ]);
      const useCase = new ResendVerificationUseCase(userRepo);

      await expect(useCase.execute({ email: EMAIL })).rejects.toMatchObject({ statusCode: 429 });
    });

    it("throws 400 for a malformed email", async () => {
      const useCase = new ResendVerificationUseCase(new InMemoryUserRepo());

      await expect(useCase.execute({ email: "not-an-email" })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("throws 500 when the email provider fails", async () => {
      emailMocks.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));
      const userRepo = new InMemoryUserRepo([buildUser({ email: EMAIL, isEmailVerified: false })]);
      const useCase = new ResendVerificationUseCase(userRepo);

      await expect(useCase.execute({ email: EMAIL })).rejects.toMatchObject({ statusCode: 500 });
    });
  });
});
