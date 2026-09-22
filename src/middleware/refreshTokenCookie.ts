import type { Response } from "express";

import { buildBaseCookieOptions, withoutMaxAge } from "./cookieOptions";

const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const setRefreshTokenCookie = (response: Response, token: string): void => {
  response.cookie("refreshToken", token, buildBaseCookieOptions("strict", REFRESH_TOKEN_MAX_AGE_MS));
};

export const clearRefreshTokenCookie = (response: Response): void => {
  response.clearCookie(
    "refreshToken",
    withoutMaxAge(buildBaseCookieOptions("strict", REFRESH_TOKEN_MAX_AGE_MS)),
  );
};
