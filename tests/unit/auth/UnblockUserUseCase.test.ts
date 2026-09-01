import { describe, expect, it } from "vitest";

import { UnblockUserUseCase } from "../../../src/modules/auth/application/UnblockUserUseCase";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

const USER_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const buildUseCase = (options: {
  userRepo?: InMemoryUserRepo;
} = {}) => {
  const userRepo = options.userRepo ?? new InMemoryUserRepo([
    buildUser({ id: USER_ID, isBlocked: true, blockedByUserId: ADMIN_ID, blockedAt: new Date("2026-08-01T00:00:00.000Z"), blockReason: "Reportes reiterados" }),
  ]);
  return { userRepo, useCase: new UnblockUserUseCase(userRepo) };
};

describe("UnblockUserUseCase", () => {
  it("unblocks a blocked user and records who/when", async () => {
    const { useCase, userRepo } = buildUseCase();

    const result = await useCase.execute({ userId: USER_ID, unblockedByUserId: ADMIN_ID });

    expect(result).toMatchObject({ userId: USER_ID, isBlocked: false, unblockedByUserId: ADMIN_ID });
    expect(result.unblockedAt).toBeInstanceOf(Date);

    const stored = await userRepo.findById(USER_ID);
    expect(stored?.isBlocked).toBe(false);
    expect(stored?.unblockedByUserId).toBe(ADMIN_ID);
  });

  it("keeps the original block record for traceability", async () => {
    const { useCase, userRepo } = buildUseCase();

    await useCase.execute({ userId: USER_ID, unblockedByUserId: ADMIN_ID });

    const stored = await userRepo.findById(USER_ID);
    expect(stored?.blockedByUserId).toBe(ADMIN_ID);
    expect(stored?.blockReason).toBe("Reportes reiterados");
  });

  describe("errores", () => {
    it("throws 404 when the user does not exist", async () => {
      const { useCase } = buildUseCase({ userRepo: new InMemoryUserRepo() });

      await expect(
        useCase.execute({ userId: USER_ID, unblockedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
    });

    it("throws 409 when the user is not blocked", async () => {
      const userRepo = new InMemoryUserRepo([buildUser({ id: USER_ID, isBlocked: false })]);
      const { useCase } = buildUseCase({ userRepo });

      await expect(
        useCase.execute({ userId: USER_ID, unblockedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 409, code: "USER_NOT_BLOCKED" });
    });

    it("throws 400 for an invalid userId", async () => {
      const { useCase } = buildUseCase();

      await expect(
        useCase.execute({ userId: "not-a-uuid", unblockedByUserId: ADMIN_ID }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
