import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { PostgresUserRepo } from "../../src/modules/auth/infrastructure/PostgresUserRepo";
import { prisma } from "../../src/shared/infrastructure/prisma";
import type { User } from "../../src/modules/auth/domain/User";

/**
 * Foundation integration test (audit finding: no test in the project ever
 * touches real Postgres, so enum-mapping/constraint bugs in the SQL layer
 * depend entirely on manual review). Requires `npm run test:integration:setup`
 * to have applied migrations to the test database first.
 */
describe("PostgresUserRepo (real Postgres)", () => {
  const repo = new PostgresUserRepo();
  const createdUserIds: string[] = [];

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const buildUser = (overrides: Partial<User> = {}): User => {
    const id = randomUUID();
    return {
      id,
      email: `integration-test-${id}@example.com`,
      firstName: "Integration",
      lastName: "Test",
      role: "user",
      approvalStatus: "approved",
      authProvider: "local",
      isEmailVerified: false,
      isBlocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  };

  it("round-trips a created user, mapping enums and optional fields correctly", async () => {
    const user = buildUser({
      role: "business_admin",
      approvalStatus: "pending",
      authProvider: "google",
      googleId: `google-${randomUUID()}`,
      isEmailVerified: true,
    });

    const saved = await repo.save(user);
    createdUserIds.push(saved.id);

    const byId = await repo.findById(user.id);
    const byEmail = await repo.findByEmail(user.email);

    expect(byId).toMatchObject({
      id: user.id,
      email: user.email,
      role: "business_admin",
      approvalStatus: "pending",
      authProvider: "google",
      googleId: user.googleId,
      isEmailVerified: true,
      isBlocked: false,
    });
    expect(byId?.passwordHash).toBeUndefined();
    expect(byEmail?.id).toBe(user.id);
  });

  it("updates an existing row in place on a second save with the same id", async () => {
    const user = buildUser();
    await repo.save(user);
    createdUserIds.push(user.id);

    const updated = await repo.save({ ...user, isBlocked: true, blockReason: "test" });

    expect(updated.isBlocked).toBe(true);
    const reloaded = await repo.findById(user.id);
    expect(reloaded?.isBlocked).toBe(true);
    expect(reloaded?.blockReason).toBe("test");

    const count = await prisma.user.count({ where: { email: user.email } });
    expect(count).toBe(1);
  });

  it("enforces the unique email constraint at the database level", async () => {
    const email = `integration-test-${randomUUID()}@example.com`;
    const first = buildUser({ email });
    await repo.save(first);
    createdUserIds.push(first.id);

    const second = buildUser({ email });

    await expect(repo.save(second)).rejects.toThrow();
  });

  describe("findMany / countMany", () => {
    // Shared scenario for every test in this block: created once, since none
    // of them mutate it.
    const seed = async () => {
      const prefix = randomUUID();
      const users = await Promise.all([
        repo.save(buildUser({
          email: `${prefix}-ana.garcia@example.com`, firstName: "Ana", lastName: "Garcia",
          role: "business_admin", approvalStatus: "pending", isBlocked: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        })),
        repo.save(buildUser({
          email: `${prefix}-bruno@example.com`, firstName: "Bruno", lastName: "Lopez",
          role: "user", approvalStatus: "approved", isBlocked: true,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
        })),
      ]);
      createdUserIds.push(...users.map((u) => u.id));
      return { prefix, users };
    };

    it("filters by role, isBlocked and approvalStatus against real Postgres enums", async () => {
      const { prefix } = await seed();
      const byPrefix = { search: prefix };

      const admins = await repo.findMany({ ...byPrefix, role: "business_admin" });
      expect(admins.map((u) => u.email)).toEqual([expect.stringContaining("ana.garcia")]);

      const blocked = await repo.findMany({ ...byPrefix, isBlocked: true });
      expect(blocked.map((u) => u.email)).toEqual([expect.stringContaining("bruno")]);

      const pending = await repo.findMany({ ...byPrefix, approvalStatus: "pending" });
      expect(pending.map((u) => u.email)).toEqual([expect.stringContaining("ana.garcia")]);
    });

    it("search matches email, firstName and lastName, case-insensitive", async () => {
      const { prefix } = await seed();

      await expect(repo.findMany({ search: "GARCIA" })).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ firstName: "Ana" })]),
      );
      await expect(repo.findMany({ search: `${prefix}-bruno` })).resolves.toEqual([
        expect.objectContaining({ firstName: "Bruno" }),
      ]);
    });

    it("countMany agrees with findMany for the same filter", async () => {
      const { prefix } = await seed();

      const rows = await repo.findMany({ search: prefix });
      const count = await repo.countMany({ search: prefix });

      expect(count).toBe(rows.length);
      expect(count).toBe(2);
    });

    it("paginates in the database via skip/take, sorted by createdAt", async () => {
      const { prefix } = await seed();

      const page = await repo.findMany({ search: prefix, sortBy: "createdAt", sortDir: "asc", skip: 1, take: 1 });

      expect(page).toHaveLength(1);
      expect(page[0].firstName).toBe("Bruno");
    });
  });
});
