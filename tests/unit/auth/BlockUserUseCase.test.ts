import { describe, expect, it } from "vitest";

import { BlockUserUseCase } from "../../../src/modules/auth/application/BlockUserUseCase";
import { InMemoryRefreshSessionRepo, InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

const USER_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  userRepo?: InMemoryUserRepo;
  refreshSessionRepo?: InMemoryRefreshSessionRepo;
} = {}) => {
  const userRepo = options.userRepo ?? new InMemoryUserRepo([buildUser({ id: USER_ID })]);
  const refreshSessionRepo = options.refreshSessionRepo ?? new InMemoryRefreshSessionRepo();
  return { userRepo, refreshSessionRepo, useCase: new BlockUserUseCase(userRepo, refreshSessionRepo) };
};

describe("BlockUserUseCase", () => {
  it("blocks a user and records who/when/why", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ userId: USER_ID, blockedByUserId: ADMIN_ID, reason: "Reportes reiterados" });

    expect(result.isBlocked).toBe(true);
    expect(result.blockedByUserId).toBe(ADMIN_ID);
    expect(result.blockReason).toBe("Reportes reiterados");
    expect(result.blockedAt).toBeInstanceOf(Date);
  });

  it("revokes all active sessions", async () => {
    const { useCase, refreshSessionRepo } = buildUseCase();

    await useCase.execute({ userId: USER_ID, blockedByUserId: ADMIN_ID, reason: "x" });

    expect(refreshSessionRepo.revokedUserIds).toContain(USER_ID);
  });

  describe("errores", () => {
    it("throws 404 when the user does not exist", async () => {
      const { useCase } = buildUseCase({ userRepo: new InMemoryUserRepo() });

      await expect(
        useCase.execute({ userId: USER_ID, blockedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
    });

    it("throws 409 when the user is already blocked", async () => {
      const userRepo = new InMemoryUserRepo([buildUser({ id: USER_ID, isBlocked: true })]);
      const { useCase } = buildUseCase({ userRepo });

      await expect(
        useCase.execute({ userId: USER_ID, blockedByUserId: ADMIN_ID, reason: "x" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "USER_ALREADY_BLOCKED" });
    });

    it("throws 400 for an empty reason", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ userId: USER_ID, blockedByUserId: ADMIN_ID, reason: "" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
