import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticate } from "../../../src/middleware/authenticate";

const loaderMocks = vi.hoisted(() => ({ loadAuthenticatedUser: vi.fn() }));

vi.mock("../../../src/middleware/loadAuthenticatedUser", () => ({
  loadAuthenticatedUser: loaderMocks.loadAuthenticatedUser,
}));

const secret = process.env.JWT_ACCESS_SECRET ?? "test-access-secret";
const USER_ID = "user-1";

const run = async (token?: string) => {
  const request = { headers: token ? { authorization: `Bearer ${token}` } : {} } as never;
  const next = vi.fn();
  await authenticate(request, {} as never, next);
  return { request: request as { user?: Record<string, unknown> }, next };
};

const validToken = (claims: object = {}) =>
  jwt.sign({ email: "old@example.com", role: "user", approvalStatus: "pending", ...claims }, secret, {
    subject: USER_ID,
    expiresIn: "15m",
  });

describe("authenticate", () => {
  beforeEach(() => {
    loaderMocks.loadAuthenticatedUser.mockReset();
  });

  it("takes role and approval status from the database, not from the token claims", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue({
      id: USER_ID, email: "now@example.com", role: "business_admin", approvalStatus: "approved", isBlocked: false,
    });

    const { request, next } = await run(validToken());

    expect(next).toHaveBeenCalledWith();
    expect(request.user).toEqual({
      id: USER_ID, email: "now@example.com", role: "business_admin", approvalStatus: "approved",
    });
  });

  it("rejects a valid token whose user is now blocked with 403 ACCOUNT_BLOCKED", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue({
      id: USER_ID, email: "a@b.c", role: "user", approvalStatus: "approved", isBlocked: true,
    });

    const { request, next } = await run(validToken());

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "ACCOUNT_BLOCKED" }));
    expect(request.user).toBeUndefined();
  });

  it("rejects a valid token whose user no longer exists with 401", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue(null);

    const { next } = await run(validToken());

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("rejects a missing or invalid token with 401 without touching the database", async () => {
    const missing = await run();
    const invalid = await run("not-a-jwt");

    expect(missing.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(invalid.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(loaderMocks.loadAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("forwards an unexpected database failure to the error handler", async () => {
    const boom = new Error("db down");
    loaderMocks.loadAuthenticatedUser.mockRejectedValue(boom);

    const { next } = await run(validToken());

    expect(next).toHaveBeenCalledWith(boom);
  });

  it("rejects a token signed with 'none', whatever its header claims", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue({
      id: USER_ID, email: "a@b.c", role: "user", approvalStatus: "approved", isBlocked: false,
    });
    // jsonwebtoken only emits alg:none when explicitly asked, which is exactly
    // the token an attacker forges to skip the signature altogether.
    const unsigned = jwt.sign({ email: "a@b.c" }, "", { algorithm: "none", subject: USER_ID });

    const { next } = await run(unsigned);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(loaderMocks.loadAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("accepts only HS256, the algorithm the tokens are issued with", async () => {
    loaderMocks.loadAuthenticatedUser.mockResolvedValue({
      id: USER_ID, email: "a@b.c", role: "user", approvalStatus: "approved", isBlocked: false,
    });
    const hs512 = jwt.sign({ email: "a@b.c" }, secret, { algorithm: "HS512", subject: USER_ID });

    const { next } = await run(hs512);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
