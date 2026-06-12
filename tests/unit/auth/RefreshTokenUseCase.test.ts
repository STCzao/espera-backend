import { describe, expect, it, vi } from "vitest";

import { RefreshTokenUseCase } from "../../../src/modules/auth/application/RefreshTokenUseCase";
import {
  buildSession,
  buildUser,
  InMemoryRefreshSessionRepo,
  InMemoryUserRepo,
} from "../../helpers/authFakes";

const tokenService = {
  hashRefreshToken: vi.fn((token: string) => `hash:${token}`),
  generateRefreshToken: vi.fn(() => ({
    token: "new-refresh-token",
    hash: "new-refresh-token-hash",
  })),
  getRefreshTokenExpiryDate: vi.fn(
    () => new Date("2026-02-01T00:00:00.000Z"),
  ),
  generateAccessToken: vi.fn(() => "new-access-token"),
};

describe("RefreshTokenUseCase", () => {
  it("rotates a valid refresh token and returns a new access token", async () => {
    const userRepo = new InMemoryUserRepo([buildUser()]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo([
      buildSession({ tokenHash: "hash:old-refresh-token" }),
    ]);
    const useCase = new RefreshTokenUseCase(
      userRepo,
      refreshSessionRepo,
      tokenService,
    );

    const result = await useCase.execute({
      refreshToken: "old-refresh-token",
    });

    expect(result).toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
    expect(refreshSessionRepo.all()[0]).toMatchObject({
      tokenHash: "new-refresh-token-hash",
      expiresAt: new Date("2026-02-01T00:00:00.000Z"),
    });
  });

  it("rejects revoked refresh tokens", async () => {
    const userRepo = new InMemoryUserRepo([buildUser()]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo([
      buildSession({
        tokenHash: "hash:revoked-token",
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);
    const useCase = new RefreshTokenUseCase(
      userRepo,
      refreshSessionRepo,
      tokenService,
    );

    await expect(
      useCase.execute({ refreshToken: "revoked-token" }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid or expired token.",
    });
  });
});
