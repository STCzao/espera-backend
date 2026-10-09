import { describe, expect, it } from "vitest";

import { ListUsersUseCase } from "../../../src/modules/auth/application/ListUsersUseCase";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

describe("ListUsersUseCase", () => {
  it("returns every user, newest first by default", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: "u1", email: "a@example.com", createdAt: new Date("2026-01-01") }),
      buildUser({ id: "u2", email: "b@example.com", createdAt: new Date("2026-02-01") }),
    ]);
    const useCase = new ListUsersUseCase(userRepo);

    const result = await useCase.execute({});

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.userId)).toEqual(["u2", "u1"]);
  });

  it("never exposes passwordHash or any token field", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: "u1", passwordHash: "hash", emailVerificationToken: "tok" }),
    ]);
    const useCase = new ListUsersUseCase(userRepo);

    const result = await useCase.execute({});

    expect(Object.keys(result.items[0]).sort()).toEqual(
      ["approvalStatus", "createdAt", "email", "firstName", "isBlocked", "lastName", "role", "userId"].sort(),
    );
  });

  it("filters by role", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: "u1", role: "user" }),
      buildUser({ id: "u2", role: "business_admin" }),
    ]);
    const useCase = new ListUsersUseCase(userRepo);

    const result = await useCase.execute({ role: "business_admin" });

    expect(result.items.map((item) => item.userId)).toEqual(["u2"]);
  });

  it("filters by isBlocked", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: "u1", isBlocked: true }),
      buildUser({ id: "u2", isBlocked: false }),
    ]);
    const useCase = new ListUsersUseCase(userRepo);

    const result = await useCase.execute({ isBlocked: true });

    expect(result.items.map((item) => item.userId)).toEqual(["u1"]);
  });

  it("filters by approvalStatus", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: "u1", approvalStatus: "pending" }),
      buildUser({ id: "u2", approvalStatus: "approved" }),
    ]);
    const useCase = new ListUsersUseCase(userRepo);

    const result = await useCase.execute({ approvalStatus: "pending" });

    expect(result.items.map((item) => item.userId)).toEqual(["u1"]);
  });

  it("searches across email, firstName and lastName, case-insensitive", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: "u1", email: "ana.garcia@example.com", firstName: "Ana", lastName: "Garcia" }),
      buildUser({ id: "u2", email: "other@example.com", firstName: "Bruno", lastName: "Lopez" }),
    ]);
    const useCase = new ListUsersUseCase(userRepo);

    await expect(useCase.execute({ search: "GARCIA" })).resolves.toMatchObject({
      items: [{ userId: "u1" }],
    });
    await expect(useCase.execute({ search: "ana.garcia" })).resolves.toMatchObject({
      items: [{ userId: "u1" }],
    });
    await expect(useCase.execute({ search: "bruno" })).resolves.toMatchObject({
      items: [{ userId: "u2" }],
    });
  });

  it("paginates: page/pageSize push into skip/take, total reflects the unpaginated count", async () => {
    const userRepo = new InMemoryUserRepo(
      Array.from({ length: 25 }, (_, i) =>
        buildUser({ id: `u${i}`, email: `u${i}@example.com`, createdAt: new Date(2026, 0, i + 1) }),
      ),
    );
    const useCase = new ListUsersUseCase(userRepo);

    const result = await useCase.execute({ page: 2, pageSize: 10, sortBy: "createdAt", sortDir: "asc" });

    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.items).toHaveLength(10);
    expect(result.items[0].userId).toBe("u10");
  });

  it("rejects an invalid role", async () => {
    const useCase = new ListUsersUseCase(new InMemoryUserRepo());

    await expect(useCase.execute({ role: "admin" as never })).rejects.toMatchObject({ statusCode: 400 });
  });
});
