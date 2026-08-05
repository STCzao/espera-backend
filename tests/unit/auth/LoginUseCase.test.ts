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
    expect(loginAttemptMocks.resetLoginAttemptStatus).toHaveBeenCalledWith(
      "user@example.com",
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
      "user@example.com",
      undefined,
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
      "user@example.com",
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
});
