import { getGoogleOAuthConfig } from "@shared/infrastructure/env";
import { AppError } from "@shared/kernel/AppError";

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
}

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserInfoResponse {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
}

export class GoogleOAuthService {
  public getAuthorizationUrl(state: string): string {
    const config = getGoogleOAuthConfig();

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  public async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const config = getGoogleOAuthConfig();

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      // AppError, not a raw Error, like every other failure in this module
      // — an uncaught raw Error reaches errorHandler.ts as a non-AppError,
      // logged as an unexpected bug instead of an expected upstream
      // failure, and returns no `.code` for the frontend to branch on.
      throw AppError.internal(
        "Failed to exchange Google authorization code.",
        "GOOGLE_TOKEN_EXCHANGE_FAILED",
      );
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

    const userInfoResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    if (!userInfoResponse.ok) {
      throw AppError.internal(
        "Failed to fetch Google user profile.",
        "GOOGLE_PROFILE_FETCH_FAILED",
      );
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfoResponse;

    return {
      googleId: userInfo.sub,
      email: userInfo.email,
      firstName: userInfo.given_name ?? "",
      lastName: userInfo.family_name ?? "",
      emailVerified: Boolean(userInfo.email_verified),
    };
  }
}
