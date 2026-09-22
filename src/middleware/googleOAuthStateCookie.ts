import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";

import { buildBaseCookieOptions, withoutMaxAge } from "./cookieOptions";

const GOOGLE_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const GOOGLE_OAUTH_STATE_COOKIE = "googleOAuthState";

export const issueGoogleOAuthState = (response: Response): string => {
  const state = randomUUID();
  response.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
    ...buildBaseCookieOptions("lax", GOOGLE_OAUTH_STATE_MAX_AGE_MS),
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
  response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, {
    ...withoutMaxAge(buildBaseCookieOptions("lax", GOOGLE_OAUTH_STATE_MAX_AGE_MS)),
    signed: true,
  });
};
