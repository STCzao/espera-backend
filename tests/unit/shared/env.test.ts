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
