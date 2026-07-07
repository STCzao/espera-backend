import { describe, expect, it, vi } from "vitest";

import { LoginWithGoogleUseCase } from "../../../src/modules/auth/application/LoginWithGoogleUseCase";
import {
  buildUser,
  InMemoryRefreshSessionRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const buildGoogleOAuthService = (overrides = {}) => ({
  getAuthorizationUrl: vi.fn((state: string) => `https://google.test?state=${state}`),
  exchangeCodeForProfile: vi.fn().mockResolvedValue({
    googleId: "google-1",
    email: "owner.google@example.com",
    firstName: "Google",
    lastName: "Owner",
    emailVerified: true,
    ...overrides,
  }),
});

const tokenService = {
  generateAccessToken: vi.fn(() => "google-access-token"),
  generateRefreshToken: vi.fn(() => ({
    token: "google-refresh-token",
    hash: "google-refresh-token-hash",
  })),
  getRefreshTokenExpiryDate: vi.fn(
    () => new Date("2026-02-01T00:00:00.000Z"),
  ),
  hashRefreshToken: vi.fn((token: string) => `hash:${token}`),
};

describe("LoginWithGoogleUseCase", () => {
  it("issues tokens for an approved Google business admin", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        id: "google-user-1",
        email: "owner.google@example.com",
        role: "business_admin",
        approvalStatus: "approved",
        authProvider: "google",
        googleId: "google-1",
        isEmailVerified: true,
      }),
    ]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new LoginWithGoogleUseCase(
      userRepo,
      refreshSessionRepo,
      tokenService,
      buildGoogleOAuthService(),
    );

    const result = await useCase.execute({
      code: "google-code",
      state: "oauth-state",
    });

    expect(result).toEqual({
      accessToken: "google-access-token",
      refreshToken: "google-refresh-token",
    });
    expect(refreshSessionRepo.all()[0]).toMatchObject({
      userId: "google-user-1",
      tokenHash: "google-refresh-token-hash",
    });
  });

  it("allows pending Google business admins to login so they can see their review state", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        email: "owner.google@example.com",
        role: "business_admin",
        approvalStatus: "pending",
        authProvider: "google",
        googleId: "google-1",
        isEmailVerified: true,
      }),
    ]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new LoginWithGoogleUseCase(
      userRepo,
      refreshSessionRepo,
      tokenService,
      buildGoogleOAuthService(),
    );

    await expect(
      useCase.execute({ code: "google-code", state: "oauth-state" }),
    ).resolves.toEqual({ accessToken: "google-access-token", refreshToken: "google-refresh-token" });

    expect(refreshSessionRepo.all()).toHaveLength(1);
  });

  it("rejects local accounts on Google login", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        email: "owner.google@example.com",
        authProvider: "local",
      }),
    ]);
    const useCase = new LoginWithGoogleUseCase(
      userRepo,
      new InMemoryRefreshSessionRepo(),
      tokenService,
      buildGoogleOAuthService(),
    );

    await expect(
      useCase.execute({ code: "google-code", state: "oauth-state" }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "AUTH_PROVIDER_MISMATCH",
    });
  });
});
