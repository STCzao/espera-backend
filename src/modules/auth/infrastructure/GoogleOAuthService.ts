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
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: process.env.GOOGLE_CALLBACK_URL ?? "",
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  public async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: process.env.GOOGLE_CALLBACK_URL ?? "",
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange Google authorization code.");
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
      throw new Error("Failed to fetch Google user profile.");
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
