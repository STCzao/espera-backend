import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_PATH = "../../../src/shared/infrastructure/env";

describe("env — APP_ORIGIN required in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppOrigin = process.env.APP_ORIGIN;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAppOrigin === undefined) {
      delete process.env.APP_ORIGIN;
    } else {
      process.env.APP_ORIGIN = originalAppOrigin;
    }
    vi.resetModules();
  });

  it("throws at startup when NODE_ENV=production and APP_ORIGIN is missing", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    delete process.env.APP_ORIGIN;

    await expect(import(ENV_PATH)).rejects.toThrow(/APP_ORIGIN is required in production/);
  });

  it("does not throw when NODE_ENV=production and APP_ORIGIN is set", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.APP_ORIGIN = "https://app.espera.com";

    const { env } = await import(ENV_PATH);
    expect(env.APP_ORIGIN).toBe("https://app.espera.com");
  });

  it("does not require APP_ORIGIN outside production", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    delete process.env.APP_ORIGIN;

    const { env } = await import(ENV_PATH);
    expect(env.APP_ORIGIN).toBeUndefined();
  });
});

describe("env — COOKIE_SAMESITE=none exige cookies Secure", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSameSite = process.env.COOKIE_SAMESITE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSameSite === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = originalSameSite;
    vi.resetModules();
  });

  it("no arranca con none fuera de produccion: el navegador descartaria la cookie en silencio", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.COOKIE_SAMESITE = "none";

    await expect(import(ENV_PATH)).rejects.toThrow(/COOKIE_SAMESITE/);
  });

  it("acepta none en produccion, donde las cookies ya son Secure", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    // APP_ORIGIN es obligatorio en produccion: sin esto fallaria por eso y
    // no por lo que este test quiere probar.
    process.env.APP_ORIGIN = "https://app.example.com";
    process.env.COOKIE_SAMESITE = "none";

    await expect(import(ENV_PATH)).resolves.toBeDefined();
  });

  it("acepta strict fuera de produccion (el default de siempre)", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.COOKIE_SAMESITE = "strict";

    await expect(import(ENV_PATH)).resolves.toBeDefined();
  });

  it("rechaza un valor que no sea strict/lax/none", async () => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.APP_ORIGIN = "https://app.example.com";
    process.env.COOKIE_SAMESITE = "None";

    await expect(import(ENV_PATH)).rejects.toThrow();
  });
});
