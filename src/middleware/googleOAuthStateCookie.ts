import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";

const buildCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 10 * 60 * 1000,
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

const GOOGLE_OAUTH_STATE_COOKIE = "googleOAuthState";

export const issueGoogleOAuthState = (response: Response): string => {
  const state = randomUUID();
  response.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
    ...buildCookieOptions(),
    signed: true,
  });

  return state;
};

export const readGoogleOAuthState = (request: Request): string | undefined => {
  const signedCookies = request.signedCookies as Record<string, unknown> | undefined;
  const value = signedCookies?.[GOOGLE_OAUTH_STATE_COOKIE];
  return typeof value === "string" ? value : undefined;
};

export const clearGoogleOAuthState = (response: Response): void => {
  const { maxAge: _maxAge, ...clearCookieOptions } = buildCookieOptions();
  response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
    ...clearCookieOptions,
    signed: true,
  });
};
