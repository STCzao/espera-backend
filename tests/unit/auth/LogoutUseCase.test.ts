import { describe, expect, it, vi } from "vitest";

import { LogoutUseCase } from "../../../src/modules/auth/application/LogoutUseCase";
import { buildSession, InMemoryRefreshSessionRepo } from "../../helpers/authFakes";

const tokenService = {
  hashRefreshToken: vi.fn((token: string) => `hash:${token}`),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  getRefreshTokenExpiryDate: vi.fn(),
};

describe("LogoutUseCase", () => {
  it("revokes the current refresh session", async () => {
    const refreshSessionRepo = new InMemoryRefreshSessionRepo([
      buildSession({ tokenHash: "hash:refresh-token" }),
    ]);
    const useCase = new LogoutUseCase(refreshSessionRepo, tokenService);

    await useCase.execute({ refreshToken: "refresh-token" });

    expect(refreshSessionRepo.revokedSessionIds).toEqual(["session-1"]);
  });

  it("is idempotent when the token does not exist", async () => {
    const refreshSessionRepo = new InMemoryRefreshSessionRepo();
    const useCase = new LogoutUseCase(refreshSessionRepo, tokenService);

    await useCase.execute({ refreshToken: "missing-token" });

    expect(refreshSessionRepo.revokedSessionIds).toEqual([]);
  });
});
