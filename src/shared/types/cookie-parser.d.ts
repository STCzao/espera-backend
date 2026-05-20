declare module "cookie-parser" {
  import type { RequestHandler } from "express";

  interface CookieParser {
    (secret?: string | string[], options?: unknown): RequestHandler;
    JSONCookie(jsonCookie: string): unknown;
    JSONCookies<T extends Record<string, unknown>>(jsonCookies: T): T;
    signedCookie(cookie: string, secret: string | string[]): string | false;
    signedCookies<T extends Record<string, unknown>>(cookies: T, secret: string | string[]): T;
  }

  const cookieParser: CookieParser;

  export default cookieParser;
}
