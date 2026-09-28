import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateSocket } from "../../../src/middleware/authenticateSocket";

const loaderMocks = vi.hoisted(() => ({ loadAuthenticatedUser: vi.fn() }));

vi.mock("../../../src/middleware/loadAuthenticatedUser", () => ({
  loadAuthenticatedUser: loaderMocks.loadAuthenticatedUser,
}));

const secret = process.env.JWT_ACCESS_SECRET as string;
const USER_ID = "user-1";

const staff = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  email: "staff@example.com",
  role: "employee",
  approvalStatus: "approved",
  isBlocked: false,
  ...overrides,
});

const tokenFor = (options: jwt.SignOptions = {}) =>
  jwt.sign({ email: "staff@example.com" }, secret, {
    subject: USER_ID,
    expiresIn: "15m",
    algorithm: "HS256",
    ...options,
  });

describe("authenticateSocket", () => {
  beforeEach(() => {
    loaderMocks.loadAuthenticatedUser.mockReset().mockResolvedValue(staff());
  });

  it("resolves a valid token into the user as the database has it right now", async () => {
    await expect(authenticateSocket(tokenFor())).resolves.toMatchObject({
      id: USER_ID,
      role: "employee",
    });
    expect(loaderMocks.loadAuthenticatedUser).toHaveBeenCalledWith(USER_ID);
  });

  it("treats a missing or empty token as anonymous, without touching the database", async () => {
    for (const token of [undefined, null, "", "   ", 42, {}]) {
      await expect(authenticateSocket(token)).resolves.toBeNull();
    }
    expect(loaderMocks.loadAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("treats an expired token as anonymous instead of throwing", async () => {
    const expired = jwt.sign({}, secret, { subject: USER_ID, expiresIn: "-1s" });

    await expect(authenticateSocket(expired)).resolves.toBeNull();
    expect(loaderMocks.loadAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("rejects a token signed with another algorithm or another secret", async () => {
    await expect(authenticateSocket(tokenFor({ algorithm: "HS512" }))).resolves.toBeNull();
    await expect(
      authenticateSocket(jwt.sign({}, "some-other-secret-at-least-32-chars", { subject: USER_ID })),
    ).resolves.toBeNull();
    await expect(
      authenticateSocket(jwt.sign({}, "", { algorithm: "none", subject: USER_ID })),
    ).resolves.toBeNull();
  });

  it("rejects a user that no longer exists", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue(null);

    await expect(authenticateSocket(tokenFor())).resolves.toBeNull();
  });

  it("rejects a blocked user, however fresh their token is", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue(staff({ isBlocked: true }));

    await expect(authenticateSocket(tokenFor())).resolves.toBeNull();
  });
});
