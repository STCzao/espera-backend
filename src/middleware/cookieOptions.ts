export interface BaseCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict" | "lax";
  maxAge: number;
  path: string;
  domain?: string;
}

/**
 * Shared shape for every cookie this app sets (refreshToken,
 * googleOAuthState): httpOnly, secure-in-production, scoped to COOKIE_DOMAIN
 * when configured. Read fresh on every call (not cached at module load) so
 * it reflects the current process.env — cheap, and avoids a stale
 * NODE_ENV/COOKIE_DOMAIN snapshot if either is ever set after import (tests
 * stubbing env vars, in particular).
 */
export const buildBaseCookieOptions = (
  sameSite: BaseCookieOptions["sameSite"],
  maxAgeMs: number,
): BaseCookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite,
  maxAge: maxAgeMs,
  path: "/",
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

/**
 * clearCookie() rejects a maxAge — same "strip it before clearing" step
 * both refreshToken and googleOAuthState need.
 */
export const withoutMaxAge = <T extends { maxAge: number }>(
  options: T,
): Omit<T, "maxAge"> => {
  const { maxAge: _maxAge, ...rest } = options;
  return rest;
};
