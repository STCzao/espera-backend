import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app";

const authMocks = vi.hoisted(() => ({
  approveBusinessAccountExecute: vi.fn(),
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
}));

vi.mock("../../../src/modules/auth/application/ApproveBusinessAccountUseCase", () => ({
  ApproveBusinessAccountUseCase: class {
    public execute = authMocks.approveBusinessAccountExecute;
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

describe("auth API", () => {
  beforeEach(() => {
    authMocks.approveBusinessAccountExecute.mockReset();
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
    expect(response.body).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
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
});
