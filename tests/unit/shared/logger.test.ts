import { Writable } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { loggerOptions } from "../../../src/shared/infrastructure/logger";

// pino writes through its own internal buffering (sonic-boom), so the chunk
// isn't in `lines` synchronously after `.info()` returns, and not
// necessarily after just one microtask either — poll instead of assuming a
// fixed delay is long enough.
const waitForLine = async (lines: string[]): Promise<string> => {
  const deadline = Date.now() + 2000;
  while (lines.length === 0) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for a log line.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return lines[0];
};

const buildTestLogger = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  // tests/setup/env.ts sets LOG_LEVEL=silent for the whole suite, and
  // loggerOptions.level captures that at import time — override it here so
  // this logger actually emits; only redact behavior is under test.
  return { testLogger: pino({ ...loggerOptions, level: "info" }, stream), lines };
};

describe("logger redact config", () => {
  it("redacts the Authorization header pino-http's req serializer would log", async () => {
    const { testLogger, lines } = buildTestLogger();

    testLogger.info({ req: { headers: { authorization: "Bearer super-secret-token" } } }, "request");

    const logged = JSON.parse(await waitForLine(lines));
    expect(logged.req.headers.authorization).toBe("[REDACTED]");
  });

  it("redacts the cookie header (refreshToken/googleOAuthState)", async () => {
    const { testLogger, lines } = buildTestLogger();

    testLogger.info({ req: { headers: { cookie: "refreshToken=super-secret-refresh" } } }, "request");

    const logged = JSON.parse(await waitForLine(lines));
    expect(logged.req.headers.cookie).toBe("[REDACTED]");
  });

  it("redacts the response Set-Cookie header", async () => {
    const { testLogger, lines } = buildTestLogger();

    testLogger.info({ res: { headers: { "set-cookie": "refreshToken=super-secret-refresh; HttpOnly" } } }, "response");

    const logged = JSON.parse(await waitForLine(lines));
    expect(logged.res.headers["set-cookie"]).toBe("[REDACTED]");
  });

  it("does not redact unrelated fields", async () => {
    const { testLogger, lines } = buildTestLogger();

    testLogger.info({ req: { headers: { "user-agent": "vitest" } } }, "request");

    const logged = JSON.parse(await waitForLine(lines));
    expect(logged.req.headers["user-agent"]).toBe("vitest");
  });
});
