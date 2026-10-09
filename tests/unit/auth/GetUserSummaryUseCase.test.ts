import { describe, expect, it } from "vitest";

import { GetUserSummaryUseCase } from "../../../src/modules/auth/application/GetUserSummaryUseCase";
import { InMemoryUserRepo, buildUser } from "../../helpers/authFakes";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GetUserSummaryUseCase", () => {
  it("resolves a narrow summary of the user", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({
        id: USER_ID, firstName: "Ana", lastName: "Garcia", email: "ana@example.com",
        role: "business_admin", approvalStatus: "approved", isBlocked: false,
      }),
    ]);
    const useCase = new GetUserSummaryUseCase(userRepo);

    const result = await useCase.execute({ userId: USER_ID });

    expect(result).toEqual({
      userId: USER_ID,
      firstName: "Ana",
      lastName: "Garcia",
      email: "ana@example.com",
      role: "business_admin",
      approvalStatus: "approved",
      isBlocked: false,
      createdAt: result.createdAt,
    });
  });

  it("never exposes passwordHash or any token field", async () => {
    const userRepo = new InMemoryUserRepo([
      buildUser({ id: USER_ID, passwordHash: "hash", emailVerificationToken: "tok" }),
    ]);
    const useCase = new GetUserSummaryUseCase(userRepo);

    const result = await useCase.execute({ userId: USER_ID });

    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("emailVerificationToken");
  });

  it("throws 404 for an unknown user", async () => {
    const useCase = new GetUserSummaryUseCase(new InMemoryUserRepo());

    await expect(useCase.execute({ userId: USER_ID })).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  it("throws 400 for a malformed id", async () => {
    const useCase = new GetUserSummaryUseCase(new InMemoryUserRepo());

    await expect(useCase.execute({ userId: "not-a-uuid" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
