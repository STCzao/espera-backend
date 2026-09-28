export interface BaseCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
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
 *
 * El `sameSite` que pide cada llamada es el valor por defecto, y
 * COOKIE_SAMESITE lo pisa cuando el despliegue tiene el frontend en otro
 * sitio que el backend (ver env.ts). Se pisan las dos cookies a la vez: si
 * el despliegue es cross-site, lo es para todas, y dejar una en "lax"
 * romperia el login con Google en vez del refresh.
 */
export const buildBaseCookieOptions = (
  sameSite: BaseCookieOptions["sameSite"],
  maxAgeMs: number,
): BaseCookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.COOKIE_SAMESITE as BaseCookieOptions["sameSite"] | undefined) ?? sameSite,
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
