import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginUseCase } from "../../../src/modules/auth/application/LoginUseCase";
import {
  buildUser,
  InMemoryRefreshSessionRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const loginAttemptMocks = vi.hoisted(() => ({
  getLoginAttemptStatus: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
  resetLoginAttemptStatus: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/loginAttemptTracker", () => ({
  getLoginAttemptStatus: loginAttemptMocks.getLoginAttemptStatus,
  recordFailedLoginAttempt: loginAttemptMocks.recordFailedLoginAttempt,
  resetLoginAttemptStatus: loginAttemptMocks.resetLoginAttemptStatus,
  SUPER_ADMIN_BLOCK_DURATION_SECONDS: 15 * 60,
}));

const tokenService = {
  generateAccessToken: vi.fn(() => "access-token"),
  generateRefreshToken: vi.fn(() => ({
    token: "refresh-token",
    hash: "refresh-token-hash",
  })),
  hashRefreshToken: vi.fn((token: string) => `hash:${token}`),
  getRefreshTokenExpiryDate: vi.fn(
    () => new Date("2026-02-01T00:00:00.000Z"),
  ),
};

describe("LoginUseCase", () => {
  beforeEach(() => {
    loginAttemptMocks.getLoginAttemptStatus.mockResolvedValue({
      failedAttempts: 0,
    });
    loginAttemptMocks.recordFailedLoginAttempt.mockResolvedValue({
      failedAttempts: 1,
    });
    loginAttemptMocks.resetLoginAttemptStatus.mockResolvedValue(undefined);
    tokenService.generateAccessToken.mockClear();
    tokenService.generateRefreshToken.mockClear();
    tokenService.hashRefreshToken.mockClear();
    tokenService.getRefreshTokenExpiryDate.mockClear();
  });

  it("issues access and refresh tokens for a verified user", async () => {
    const passwordHash = await bcrypt.hash("Password1", 12);
    const user = buildUser({ passwordHash });
    const userRepo = new InMemoryUserRepo([user]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new LoginUseCase(
      userRepo,
      refreshSessionRepo,
      tokenService,
    );

    const result = await useCase.execute({
      email: "USER@example.com",
      password: "Password1",
    });

    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(refreshSessionRepo.all()).toHaveLength(1);
    expect(refreshSessionRepo.all()[0]).toMatchObject({
      userId: user.id,
      tokenHash: "refresh-token-hash",
    });
    // Only this client's strikes are cleared, never the account-wide counter.
    expect(loginAttemptMocks.resetLoginAttemptStatus).toHaveBeenCalledTimes(1);
    expect(loginAttemptMocks.resetLoginAttemptStatus).toHaveBeenCalledWith(
      "user@example.com|unknown",
    );
  });

  it("records a failed attempt and rejects invalid credentials", async () => {
    const passwordHash = await bcrypt.hash("Password1", 12);
    const userRepo = new InMemoryUserRepo([buildUser({ passwordHash })]);
    const useCase = new LoginUseCase(
      userRepo,
      new InMemoryRefreshSessionRepo(),
      tokenService,
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "WrongPassword1",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid credentials.",
    });

    expect(loginAttemptMocks.recordFailedLoginAttempt).toHaveBeenCalledWith(
      "user@example.com|unknown",
      undefined,
    );
    expect(loginAttemptMocks.recordFailedLoginAttempt).toHaveBeenCalledWith(
      "account:user@example.com",
      undefined,
      30,
    );
  });

  it("uses a 15-minute lockout for super_admin accounts (HU-8.1)", async () => {
    const passwordHash = await bcrypt.hash("Password1", 12);
    const userRepo = new InMemoryUserRepo([
      buildUser({ passwordHash, role: "super_admin" }),
    ]);
    const useCase = new LoginUseCase(
      userRepo,
      new InMemoryRefreshSessionRepo(),
      tokenService,
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "WrongPassword1",
      }),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(loginAttemptMocks.recordFailedLoginAttempt).toHaveBeenCalledWith(
      "user@example.com|unknown",
      15 * 60,
    );
  });

  it("allows pending business admins to login so they can see their review state in the panel", async () => {
    const passwordHash = await bcrypt.hash("Password1", 12);
    const userRepo = new InMemoryUserRepo([
      buildUser({
        passwordHash,
        role: "business_admin",
        approvalStatus: "pending",
      }),
    ]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new LoginUseCase(
      userRepo,
      refreshSessionRepo,
      tokenService,
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "Password1",
      }),
    ).resolves.toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });

    expect(refreshSessionRepo.all()).toHaveLength(1);
  });

  it("blocks rejected business admins from logging in", async () => {
    const passwordHash = await bcrypt.hash("Password1", 12);
    const userRepo = new InMemoryUserRepo([
      buildUser({
        passwordHash,
        role: "business_admin",
        approvalStatus: "rejected",
      }),
    ]);
    const useCase = new LoginUseCase(
      userRepo,
      new InMemoryRefreshSessionRepo(),
      tokenService,
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "Password1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCOUNT_REJECTED",
    });
  });

  it("blocks a blocked user from logging in (HU-8.6)", async () => {
    const passwordHash = await bcrypt.hash("Password1", 12);
    const userRepo = new InMemoryUserRepo([
      buildUser({ passwordHash, isBlocked: true }),
    ]);
    const useCase = new LoginUseCase(
      userRepo,
      new InMemoryRefreshSessionRepo(),
      tokenService,
    );

    await expect(
      useCase.execute({
        email: "user@example.com",
        password: "Password1",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCOUNT_BLOCKED",
    });
  });

  describe("lockout scope (a third party must not be able to lock a victim out)", () => {
    const future = () => new Date(Date.now() + 5 * 60 * 1000);
    const statusFor = (blocked: Record<string, Date>) =>
      loginAttemptMocks.getLoginAttemptStatus.mockImplementation(async (identity: string) => ({
        failedAttempts: 0,
        blockedUntil: blocked[identity],
      }));

    const build = async () => {
      const passwordHash = await bcrypt.hash("Password1", 12);
      return new LoginUseCase(
        new InMemoryUserRepo([buildUser({ passwordHash })]),
        new InMemoryRefreshSessionRepo(),
        tokenService,
      );
    };

    it("counts strikes per (email, IP), using the caller's address", async () => {
      const useCase = await build();

      await expect(
        useCase.execute({ email: "user@example.com", password: "Wrong1", ipAddress: "203.0.113.9" }),
      ).rejects.toMatchObject({ statusCode: 401 });

      expect(loginAttemptMocks.recordFailedLoginAttempt).toHaveBeenCalledWith(
        "user@example.com|203.0.113.9",
        undefined,
      );
    });

    it("blocks a client that locked itself out of the account", async () => {
      statusFor({ "user@example.com|203.0.113.9": future() });
      const useCase = await build();

      await expect(
        useCase.execute({ email: "user@example.com", password: "Password1", ipAddress: "203.0.113.9" }),
      ).rejects.toMatchObject({ statusCode: 429, code: "LOGIN_TEMPORARILY_BLOCKED" });
    });

    it("does NOT block the real owner, on another IP, because an attacker's IP got locked", async () => {
      statusFor({ "user@example.com|198.51.100.7": future() });
      const useCase = await build();

      const result = await useCase.execute({
        email: "user@example.com",
        password: "Password1",
        ipAddress: "203.0.113.9",
      });

      expect(result.accessToken).toBe("access-token");
    });

    it("blocks everyone once the account-wide ceiling is hit (IP-rotating guesser)", async () => {
      statusFor({ "account:user@example.com": future() });
      const useCase = await build();

      await expect(
        useCase.execute({ email: "user@example.com", password: "Password1", ipAddress: "203.0.113.9" }),
      ).rejects.toMatchObject({ statusCode: 429, code: "LOGIN_TEMPORARILY_BLOCKED" });
    });
  });

  describe("enumeración de usuarios", () => {
    const rejectLogin = async (email: string) => {
      const passwordHash = await bcrypt.hash("Password1", 12);
      const useCase = new LoginUseCase(
        new InMemoryUserRepo([buildUser({ email: "user@example.com", passwordHash })]),
        new InMemoryRefreshSessionRepo(),
        tokenService,
      );

      const compare = vi.spyOn(bcrypt, "compare");
      compare.mockClear();
      await expect(useCase.execute({ email, password: "WrongPassword1" })).rejects.toMatchObject({
        statusCode: 401,
      });
      const calls = compare.mock.calls.length;
      compare.mockRestore();
      return calls;
    };

    it("runs bcrypt for an unknown email too, so the answer takes the same time as a wrong password", async () => {
      // Asserted through the bcrypt call rather than the clock: bcrypt at cost
      // 12 dominates the response, and skipping it for an unknown address (as
      // this used to) is what leaked which emails have an account. A timing
      // assertion would say the same thing but flake under CI load.
      expect(await rejectLogin("nobody@example.com")).toBe(1);
      expect(await rejectLogin("user@example.com")).toBe(1);
    });

    it("gives the same message for an unknown email and a wrong password", async () => {
      const useCase = new LoginUseCase(
        new InMemoryUserRepo([buildUser({ email: "user@example.com", passwordHash: await bcrypt.hash("Password1", 12) })]),
        new InMemoryRefreshSessionRepo(),
        tokenService,
      );

      await expect(useCase.execute({ email: "nobody@example.com", password: "x" })).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid credentials.",
      });
      await expect(useCase.execute({ email: "user@example.com", password: "x" })).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid credentials.",
      });
    });
  });
});
