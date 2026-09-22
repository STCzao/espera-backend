import { afterEach, describe, expect, it } from "vitest";

import { buildBaseCookieOptions, withoutMaxAge } from "../../../src/middleware/cookieOptions";

describe("buildBaseCookieOptions", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieDomain = process.env.COOKIE_DOMAIN;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCookieDomain === undefined) {
      delete process.env.COOKIE_DOMAIN;
    } else {
      process.env.COOKIE_DOMAIN = originalCookieDomain;
    }
  });

  it("builds httpOnly, path-/ options with the given sameSite and maxAge", () => {
    const options = buildBaseCookieOptions("strict", 1000);

    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", maxAge: 1000, path: "/" });
  });

  it("is not secure outside production", () => {
    process.env.NODE_ENV = "development";

    expect(buildBaseCookieOptions("lax", 1000).secure).toBe(false);
  });

  it("is secure in production", () => {
    process.env.NODE_ENV = "production";

    expect(buildBaseCookieOptions("lax", 1000).secure).toBe(true);
  });

  it("omits domain when COOKIE_DOMAIN is unset", () => {
    delete process.env.COOKIE_DOMAIN;

    expect(buildBaseCookieOptions("lax", 1000).domain).toBeUndefined();
  });

  it("scopes to COOKIE_DOMAIN when set", () => {
    process.env.COOKIE_DOMAIN = "espera.app";

    expect(buildBaseCookieOptions("lax", 1000).domain).toBe("espera.app");
  });
});

describe("withoutMaxAge", () => {
  it("strips maxAge but keeps every other option", () => {
    const options = buildBaseCookieOptions("strict", 5000);

    const stripped = withoutMaxAge(options);

    expect(stripped).not.toHaveProperty("maxAge");
    expect(stripped).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/" });
  });
});
