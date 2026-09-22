import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/shared/infrastructure/env", () => ({
  getGoogleOAuthConfig: () => ({
    callbackUrl: "https://app.example.com/oauth/callback",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
  }),
}));

// Imported after the mock so GoogleOAuthService picks up the fake config
// instead of requireConfiguredValue throwing on the unset GOOGLE_* env vars
// tests/setup/env.ts deliberately doesn't provide.
import { GoogleOAuthService } from "../../../src/modules/auth/infrastructure/GoogleOAuthService";

describe("GoogleOAuthService.exchangeCodeForProfile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the profile on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "at" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sub: "g-1", email: "user@example.com", given_name: "A", family_name: "B", email_verified: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const profile = await new GoogleOAuthService().exchangeCodeForProfile("code");

    expect(profile).toEqual({
      googleId: "g-1",
      email: "user@example.com",
      firstName: "A",
      lastName: "B",
      emailVerified: true,
    });
  });

  it("throws an AppError (not a raw Error) when the token exchange fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GoogleOAuthService().exchangeCodeForProfile("code")).rejects.toMatchObject({
      statusCode: 500,
      code: "GOOGLE_TOKEN_EXCHANGE_FAILED",
    });
  });

  it("throws an AppError (not a raw Error) when fetching the user profile fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "at" }) })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GoogleOAuthService().exchangeCodeForProfile("code")).rejects.toMatchObject({
      statusCode: 500,
      code: "GOOGLE_PROFILE_FETCH_FAILED",
    });
  });
});
