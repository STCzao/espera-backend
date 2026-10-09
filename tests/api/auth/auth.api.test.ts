import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app";

const authMocks = vi.hoisted(() => ({
  googleGetAuthorizationUrl: vi.fn(),
  loginExecute: vi.fn(),
  loginWithGoogleExecute: vi.fn(),
  logoutExecute: vi.fn(),
  refreshTokenExecute: vi.fn(),
  registerBusinessAccountExecute: vi.fn(),
  registerBusinessWithGoogleExecute: vi.fn(),
  registerExecute: vi.fn(),
  requestPasswordResetExecute: vi.fn(),
  resendVerificationExecute: vi.fn(),
  resetPasswordExecute: vi.fn(),
  verifyEmailExecute: vi.fn(),
  listUsersExecute: vi.fn(),
  getUserSummaryExecute: vi.fn(),
  blockUserExecute: vi.fn(),
}));

const loaderMocks = vi.hoisted(() => ({ loadAuthenticatedUser: vi.fn() }));

const BUSINESS_ADMIN_LOADER_RESULT = {
  email: "owner@example.com",
  role: "business_admin" as const,
  approvalStatus: "approved" as const,
  isBlocked: false,
};

// This suite hits every POST route through the real Express app, including
// the real `rateLimiter` middleware (only the use cases are mocked below) —
// without this, repeated local runs against a real Redis (docker compose up)
// eventually 429 once a route's window fills up. rateLimiter.test.ts already
// covers the middleware's own behavior against a mocked Redis; this just
// keeps that real client out of an unrelated suite's way.
const redisMocks = vi.hoisted(() => ({
  ensureRedisConnection: vi.fn(),
  eval: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/redis", () => ({
  ensureRedisConnection: redisMocks.ensureRedisConnection,
  redis: {
    eval: redisMocks.eval,
  },
}));

vi.mock("../../../src/modules/auth/application/LoginUseCase", () => ({
  LoginUseCase: class {
    public execute = authMocks.loginExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/LoginWithGoogleUseCase", () => ({
  LoginWithGoogleUseCase: class {
    public execute = authMocks.loginWithGoogleExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/LogoutUseCase", () => ({
  LogoutUseCase: class {
    public execute = authMocks.logoutExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/RefreshTokenUseCase", () => ({
  RefreshTokenUseCase: class {
    public execute = authMocks.refreshTokenExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/RegisterBusinessAccountUseCase", () => ({
  RegisterBusinessAccountUseCase: class {
    public execute = authMocks.registerBusinessAccountExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/RegisterBusinessWithGoogleUseCase", () => ({
  RegisterBusinessWithGoogleUseCase: class {
    public execute = authMocks.registerBusinessWithGoogleExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/RegisterUseCase", () => ({
  RegisterUseCase: class {
    public execute = authMocks.registerExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/RequestPasswordResetUseCase", () => ({
  RequestPasswordResetUseCase: class {
    public execute = authMocks.requestPasswordResetExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/ResendVerificationUseCase", () => ({
  ResendVerificationUseCase: class {
    public execute = authMocks.resendVerificationExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/ResetPasswordUseCase", () => ({
  ResetPasswordUseCase: class {
    public execute = authMocks.resetPasswordExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/VerifyEmailUseCase", () => ({
  VerifyEmailUseCase: class {
    public execute = authMocks.verifyEmailExecute;
  },
}));

vi.mock("../../../src/modules/auth/infrastructure/GoogleOAuthService", () => ({
  GoogleOAuthService: class {
    public getAuthorizationUrl = authMocks.googleGetAuthorizationUrl;
  },
}));

// authenticate re-reads the user from the database on every request; these
// suites have no database, so the loader answers with an approved business
// admin by default (reset in beforeEach) — tests that need a different
// principal (e.g. super_admin, for the Backoffice user-directory routes)
// override it with mockResolvedValueOnce.
vi.mock("../../../src/middleware/loadAuthenticatedUser", () => ({
  loadAuthenticatedUser: loaderMocks.loadAuthenticatedUser,
}));

vi.mock("../../../src/modules/auth/application/ListUsersUseCase", () => ({
  ListUsersUseCase: class {
    public execute = authMocks.listUsersExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/GetUserSummaryUseCase", () => ({
  GetUserSummaryUseCase: class {
    public execute = authMocks.getUserSummaryExecute;
  },
}));

vi.mock("../../../src/modules/auth/application/BlockUserUseCase", () => ({
  BlockUserUseCase: class {
    public execute = authMocks.blockUserExecute;
  },
}));

describe("auth API", () => {
  beforeEach(() => {
    authMocks.googleGetAuthorizationUrl.mockReset();
    authMocks.loginExecute.mockReset();
    authMocks.loginWithGoogleExecute.mockReset();
    authMocks.logoutExecute.mockReset();
    authMocks.refreshTokenExecute.mockReset();
    authMocks.registerBusinessAccountExecute.mockReset();
    authMocks.registerBusinessWithGoogleExecute.mockReset();
    authMocks.registerExecute.mockReset();
    authMocks.requestPasswordResetExecute.mockReset();
    authMocks.resendVerificationExecute.mockReset();
    authMocks.resetPasswordExecute.mockReset();
    authMocks.verifyEmailExecute.mockReset();
    authMocks.listUsersExecute.mockReset();
    authMocks.getUserSummaryExecute.mockReset();
    authMocks.blockUserExecute.mockReset();

    loaderMocks.loadAuthenticatedUser.mockReset().mockImplementation(
      async (id: string) => ({ id, ...BUSINESS_ADMIN_LOADER_RESULT }),
    );

    redisMocks.ensureRedisConnection.mockReset().mockResolvedValue(undefined);
    redisMocks.eval.mockReset().mockResolvedValue(1);
    });

  it("registers a local user and returns 201", async () => {
    authMocks.registerExecute.mockResolvedValue({ userId: "user-1" });

    const response = await request(createApp())
      .post("/api/auth/register")
      .send({
        email: "cliente@example.com",
        password: "Password1",
        confirmPassword: "Password1",
        firstName: "Cliente",
        lastName: "Demo",
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ userId: "user-1" });
    expect(authMocks.registerExecute).toHaveBeenCalledWith({
      email: "cliente@example.com",
      password: "Password1",
      confirmPassword: "Password1",
      firstName: "Cliente",
      lastName: "Demo",
    });
  });

  it("sets refresh token cookie on local login", async () => {
    authMocks.loginExecute.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    const response = await request(createApp())
      .post("/api/auth/login")
      .send({ email: "cliente@example.com", password: "Password1" });

    expect(response.status).toBe(200);
    // The refresh token must only travel via the httpOnly cookie, never in
    // the JSON body (see AuthController.login).
    expect(response.body).toEqual({ accessToken: "access-token" });
    expect(response.headers["set-cookie"]?.[0]).toContain("refreshToken=refresh-token");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("rotates refresh token from cookie", async () => {
    authMocks.refreshTokenExecute.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });

    const response = await request(createApp())
      .post("/api/auth/refresh-token")
      .set("Cookie", ["refreshToken=old-refresh-token"])
      .send();

    expect(response.status).toBe(200);
    expect(authMocks.refreshTokenExecute).toHaveBeenCalledWith({
      refreshToken: "old-refresh-token",
    });
    expect(response.headers["set-cookie"]?.[0]).toContain(
      "refreshToken=new-refresh-token",
    );
    // Same rule as login: the rotated refresh token only travels via the cookie.
    expect(response.body).toEqual({ accessToken: "new-access-token" });
  });

  it("clears refresh token cookie on logout", async () => {
    authMocks.logoutExecute.mockResolvedValue(undefined);

    const response = await request(createApp())
      .post("/api/auth/logout")
      .set("Cookie", ["refreshToken=refresh-token"])
      .send();

    expect(response.status).toBe(200);
    expect(authMocks.logoutExecute).toHaveBeenCalledWith({
      refreshToken: "refresh-token",
    });
    expect(response.headers["set-cookie"]?.[0]).toContain("refreshToken=");
  });

  it("allows business admins to call /auth/me", async () => {
    const accessToken = jwt.sign(
      {
        email: "owner@example.com",
        role: "business_admin",
        approvalStatus: "approved",
      },
      process.env.JWT_ACCESS_SECRET ?? "test-access-secret",
      { subject: "business-user-1", expiresIn: "15m" },
    );

    const response = await request(createApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      id: "business-user-1",
      email: "owner@example.com",
      role: "business_admin",
      approvalStatus: "approved",
    });
  });

  it("returns a Google authorization URL and state cookie", async () => {
    authMocks.googleGetAuthorizationUrl.mockImplementation(
      (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    );

    const response = await request(createApp()).get("/api/auth/google/url");

    expect(response.status).toBe(200);
    expect(response.body.state).toEqual(expect.any(String));
    expect(response.body.url).toContain(`state=${response.body.state}`);
    expect(response.headers["set-cookie"]?.[0]).toContain("googleOAuthState=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  describe("directorio de usuarios (Backoffice)", () => {
    const superAdminToken = () =>
      jwt.sign({}, process.env.JWT_ACCESS_SECRET ?? "test-access-secret", {
        subject: "super-admin-1", expiresIn: "15m",
      });

    const asSuperAdmin = () => {
      loaderMocks.loadAuthenticatedUser.mockResolvedValueOnce({
        id: "super-admin-1", email: "admin@example.com", role: "super_admin", approvalStatus: "approved", isBlocked: false,
      });
    };

    it("GET /auth/users requires platform:manage_approvals — a business_admin gets 403", async () => {
      const token = jwt.sign(
        { role: "business_admin" },
        process.env.JWT_ACCESS_SECRET ?? "test-access-secret",
        { subject: "biz-admin-1", expiresIn: "15m" },
      );

      const response = await request(createApp()).get("/api/auth/users").set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(authMocks.listUsersExecute).not.toHaveBeenCalled();
    });

    it("GET /auth/users forwards filters from the query string and returns the list", async () => {
      asSuperAdmin();
      authMocks.listUsersExecute.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

      const response = await request(createApp())
        .get("/api/auth/users?role=business_admin&isBlocked=true&search=ana&page=2")
        .set("Authorization", `Bearer ${superAdminToken()}`);

      expect(response.status).toBe(200);
      expect(authMocks.listUsersExecute).toHaveBeenCalledWith(
        expect.objectContaining({ role: "business_admin", isBlocked: true, search: "ana", page: 2 }),
      );
    });

    it("GET /auth/users/:userId returns the resolved summary", async () => {
      asSuperAdmin();
      authMocks.getUserSummaryExecute.mockResolvedValue({ userId: "user-9", firstName: "Ana" });

      const response = await request(createApp())
        .get("/api/auth/users/user-9")
        .set("Authorization", `Bearer ${superAdminToken()}`);

      expect(response.status).toBe(200);
      expect(authMocks.getUserSummaryExecute).toHaveBeenCalledWith({ userId: "user-9" });
      expect(response.body).toMatchObject({ userId: "user-9", firstName: "Ana" });
    });

    it("PATCH /auth/users/:userId/block blocks directly, no Report required", async () => {
      asSuperAdmin();
      authMocks.blockUserExecute.mockResolvedValue({
        userId: "user-9", isBlocked: true, blockedByUserId: "super-admin-1", blockedAt: new Date(), blockReason: "Spam",
      });

      const response = await request(createApp())
        .patch("/api/auth/users/user-9/block")
        .set("Authorization", `Bearer ${superAdminToken()}`)
        .send({ reason: "Spam" });

      expect(response.status).toBe(200);
      expect(authMocks.blockUserExecute).toHaveBeenCalledWith({
        userId: "user-9", blockedByUserId: "super-admin-1", reason: "Spam",
      });
    });
  });
});
