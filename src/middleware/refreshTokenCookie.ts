import type { Response } from "express";

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  domain: process.env.COOKIE_DOMAIN ?? "localhost",
  path: "/"
};

export const setRefreshTokenCookie = (response: Response, token: string): void => {
  response.cookie("refreshToken", token, refreshTokenCookieOptions);
};

export const clearRefreshTokenCookie = (response: Response): void => {
  response.clearCookie("refreshToken", {
    domain: refreshTokenCookieOptions.domain,
    path: refreshTokenCookieOptions.path
  });
};
