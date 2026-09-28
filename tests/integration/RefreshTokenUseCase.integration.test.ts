import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { RefreshTokenUseCase } from "../../src/modules/auth/application/RefreshTokenUseCase";
import { JWTTokenService } from "../../src/modules/auth/infrastructure/JWTTokenService";
import { PostgresRefreshSessionRepo } from "../../src/modules/auth/infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../../src/modules/auth/infrastructure/PostgresUserRepo";
import { prisma } from "../../src/shared/infrastructure/prisma";

/**
 * Proves against real Postgres what the in-memory fake can only imitate: the
 * rotation is a genuine compare-and-swap, so of two refreshes racing with the
 * same token exactly one wins. The unit fake runs on a single thread, where
 * "concurrent" calls are really sequential.
 */
describe("RefreshTokenUseCase (real Postgres rotation)", () => {
  const sessionRepo = new PostgresRefreshSessionRepo();
  const tokenService = new JWTTokenService();
  const useCase = new RefreshTokenUseCase(new PostgresUserRepo(), sessionRepo, tokenService);
  const createdUserIds: string[] = [];

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await prisma.refreshSession.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seedSession = async (token: string) => {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `refresh-it-${userId}@example.com`,
        firstName: "Refresh",
        lastName: "Test",
        role: "USER",
        approvalStatus: "APPROVED",
        authProvider: "LOCAL",
        isEmailVerified: true,
      },
    });
    createdUserIds.push(userId);
    const sessionId = randomUUID();
    await sessionRepo.save({
      id: sessionId,
      userId,
      tokenHash: tokenService.hashRefreshToken(token),
      expiresAt: tokenService.getRefreshTokenExpiryDate(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { userId, sessionId };
  };

  it("lets exactly one of several simultaneous refreshes with the same token win", async () => {
    const { sessionId } = await seedSession("shared-token");

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => useCase.execute({ refreshToken: "shared-token" })),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ statusCode: 409, code: "REFRESH_TOKEN_ROTATED" });
    }

    const row = await prisma.refreshSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.revokedAt).toBeNull();
    expect(row.previousTokenHash).toBe(tokenService.hashRefreshToken("shared-token"));
    expect(row.rotatedAt).toBeInstanceOf(Date);
  });

  it("rotate() refuses a stale expected hash and a revoked session", async () => {
    const { sessionId } = await seedSession("token-a");
    const hashA = tokenService.hashRefreshToken("token-a");
    const base = { sessionId, newExpiresAt: new Date(Date.now() + 60_000), rotatedAt: new Date() };

    expect(await sessionRepo.rotate({ ...base, expectedTokenHash: "wrong-hash", newTokenHash: "h1" })).toBe(false);
    expect(await sessionRepo.rotate({ ...base, expectedTokenHash: hashA, newTokenHash: "h1" })).toBe(true);

    await sessionRepo.revokeById(sessionId);
    expect(await sessionRepo.rotate({ ...base, expectedTokenHash: "h1", newTokenHash: "h2" })).toBe(false);
  });
});
