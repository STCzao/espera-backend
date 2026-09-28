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
});
