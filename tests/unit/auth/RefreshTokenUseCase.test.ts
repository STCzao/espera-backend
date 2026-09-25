import { describe, expect, it, vi } from "vitest";

import { ABSOLUTE_SESSION_MAX_MS, RefreshTokenUseCase } from "../../../src/modules/auth/application/RefreshTokenUseCase";
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

  it("rejects a blocked user even with an otherwise-valid, non-revoked session", async () => {
    // Direct isBlocked check, not just reliance on BlockUserUseCase having
    // revoked the session at block time.
    const userRepo = new InMemoryUserRepo([buildUser({ isBlocked: true })]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo([
      buildSession({ tokenHash: "hash:blocked-user-token" }),
    ]);
    const useCase = new RefreshTokenUseCase(userRepo, refreshSessionRepo, tokenService);

    await expect(
      useCase.execute({ refreshToken: "blocked-user-token" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "ACCOUNT_BLOCKED" });
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

  it("rejects an empty refresh token", async () => {
    const useCase = new RefreshTokenUseCase(
      new InMemoryUserRepo(),
      new InMemoryRefreshSessionRepo(),
      tokenService,
    );

    await expect(useCase.execute({ refreshToken: "" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejects a token with no matching session", async () => {
    const useCase = new RefreshTokenUseCase(
      new InMemoryUserRepo([buildUser()]),
      new InMemoryRefreshSessionRepo(),
      tokenService,
    );

    await expect(
      useCase.execute({ refreshToken: "never-issued-token" }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Invalid or expired token." });
  });

  it("rejects an expired session", async () => {
    const userRepo = new InMemoryUserRepo([buildUser()]);
    const refreshSessionRepo = new InMemoryRefreshSessionRepo([
      buildSession({
        tokenHash: "hash:expired-token",
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      }),
    ]);
    const useCase = new RefreshTokenUseCase(userRepo, refreshSessionRepo, tokenService);

    await expect(
      useCase.execute({ refreshToken: "expired-token" }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Invalid or expired token." });
  });

  it("rejects a session whose user no longer exists", async () => {
    const refreshSessionRepo = new InMemoryRefreshSessionRepo([
      buildSession({ tokenHash: "hash:orphaned-token", userId: "deleted-user" }),
    ]);
    const useCase = new RefreshTokenUseCase(
      new InMemoryUserRepo(),
      refreshSessionRepo,
      tokenService,
    );

    await expect(
      useCase.execute({ refreshToken: "orphaned-token" }),
    ).rejects.toMatchObject({ statusCode: 401, message: "Invalid or expired token." });
  });

  describe("rotation races and token reuse", () => {
    const build = (sessions: ReturnType<typeof buildSession>[]) => {
      const refreshSessionRepo = new InMemoryRefreshSessionRepo(sessions);
      const useCase = new RefreshTokenUseCase(new InMemoryUserRepo([buildUser()]), refreshSessionRepo, tokenService);
      return { refreshSessionRepo, useCase };
    };

    it("lets exactly one of two concurrent refreshes with the same token win", async () => {
      const { useCase, refreshSessionRepo } = build([buildSession({ tokenHash: "hash:shared-token" })]);

      const results = await Promise.allSettled([
        useCase.execute({ refreshToken: "shared-token" }),
        useCase.execute({ refreshToken: "shared-token" }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ statusCode: 409, code: "REFRESH_TOKEN_ROTATED" });
      expect(refreshSessionRepo.all()[0].revokedAt).toBeUndefined();
    });

    it("answers 409 (not a logout) when the previous token shows up right after a rotation", async () => {
      const { useCase, refreshSessionRepo } = build([
        buildSession({
          tokenHash: "hash:current",
          previousTokenHash: "hash:just-rotated",
          rotatedAt: new Date(Date.now() - 2_000),
        }),
      ]);

      await expect(useCase.execute({ refreshToken: "just-rotated" })).rejects.toMatchObject({
        statusCode: 409,
        code: "REFRESH_TOKEN_ROTATED",
      });
      expect(refreshSessionRepo.revokedSessionIds).toEqual([]);
    });

    it("revokes the whole session when an old token is replayed long after its rotation", async () => {
      const { useCase, refreshSessionRepo } = build([
        buildSession({
          tokenHash: "hash:current",
          previousTokenHash: "hash:stolen",
          rotatedAt: new Date(Date.now() - 60_000),
        }),
      ]);

      await expect(useCase.execute({ refreshToken: "stolen" })).rejects.toMatchObject({ statusCode: 401 });
      expect(refreshSessionRepo.revokedSessionIds).toEqual(["session-1"]);
      // ...so the token the real owner holds is dead too.
      await expect(useCase.execute({ refreshToken: "current" })).rejects.toMatchObject({ statusCode: 401 });
    });

    it("refuses to refresh a session older than the absolute cap and revokes it", async () => {
      const { useCase, refreshSessionRepo } = build([
        buildSession({
          tokenHash: "hash:old-login",
          createdAt: new Date(Date.now() - ABSOLUTE_SESSION_MAX_MS - 1_000),
        }),
      ]);

      await expect(useCase.execute({ refreshToken: "old-login" })).rejects.toMatchObject({
        statusCode: 401,
        code: "SESSION_EXPIRED",
      });
      expect(refreshSessionRepo.revokedSessionIds).toEqual(["session-1"]);
    });

    it("never extends a rotated token past the absolute cap", async () => {
      const createdAt = new Date(Date.now() - ABSOLUTE_SESSION_MAX_MS + 3 * 24 * 60 * 60 * 1000);
      const { useCase, refreshSessionRepo } = build([buildSession({ tokenHash: "hash:almost-capped", createdAt })]);
      // The mocked sliding expiry is far in the past relative to the cap, so
      // swap in a far-future one to prove the cap is what wins.
      tokenService.getRefreshTokenExpiryDate.mockReturnValueOnce(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

      await useCase.execute({ refreshToken: "almost-capped" });

      expect(refreshSessionRepo.all()[0].expiresAt.getTime()).toBe(createdAt.getTime() + ABSOLUTE_SESSION_MAX_MS);
    });
  });
});
