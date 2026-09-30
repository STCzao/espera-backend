import { afterEach, describe, expect, it } from "vitest";

import { buildBaseCookieOptions, withoutMaxAge } from "../../../src/middleware/cookieOptions";

describe("buildBaseCookieOptions", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCookieDomain = process.env.COOKIE_DOMAIN;
  const originalSameSite = process.env.COOKIE_SAMESITE;

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    restore("COOKIE_DOMAIN", originalCookieDomain);
    restore("COOKIE_SAMESITE", originalSameSite);
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

describe("COOKIE_SAMESITE — puente para un despliegue cross-site", () => {
  const originalSameSite = process.env.COOKIE_SAMESITE;

  afterEach(() => {
    if (originalSameSite === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = originalSameSite;
  });

  it("usa el sameSite que pide cada cookie cuando la variable no esta seteada", () => {
    delete process.env.COOKIE_SAMESITE;

    expect(buildBaseCookieOptions("strict", 1000).sameSite).toBe("strict");
    expect(buildBaseCookieOptions("lax", 1000).sameSite).toBe("lax");
  });

  it("pisa las DOS cookies, no solo la del refresh", () => {
    // Si solo se pisara "strict", el login con Google (cookie de estado, en
    // "lax") seguiria roto cross-site, que fue el segundo sintoma.
    process.env.COOKIE_SAMESITE = "none";

    expect(buildBaseCookieOptions("strict", 1000).sameSite).toBe("none");
    expect(buildBaseCookieOptions("lax", 1000).sameSite).toBe("none");
  });

  it("permite volver a strict sacando la variable, sin tocar codigo", () => {
    process.env.COOKIE_SAMESITE = "none";
    expect(buildBaseCookieOptions("strict", 1000).sameSite).toBe("none");

    delete process.env.COOKIE_SAMESITE;
    expect(buildBaseCookieOptions("strict", 1000).sameSite).toBe("strict");
  });

  it("deja intacto el resto de la cookie", () => {
    process.env.COOKIE_SAMESITE = "none";

    expect(buildBaseCookieOptions("strict", 1000)).toMatchObject({
      httpOnly: true,
      path: "/",
      maxAge: 1000,
    });
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
