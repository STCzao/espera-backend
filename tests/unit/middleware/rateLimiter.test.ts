import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { rateLimiter } from "../../../src/middleware/rateLimiter";

const redisMocks = vi.hoisted(() => ({
  ensureRedisConnection: vi.fn(),
  eval: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/redis", () => ({
  ensureRedisConnection: redisMocks.ensureRedisConnection,
  redis: {
    eval: redisMocks.eval,
  },
}));

vi.mock("../../../src/shared/infrastructure/logger", () => ({
  logger: {
    error: loggerMocks.error,
    info: loggerMocks.info,
  },
}));

const buildRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    method: "POST",
    path: "/login",
    headers: {},
    ip: "127.0.0.1",
    ...overrides,
  }) as Request;

// redisCounter runs INCR+EXPIRE as one Lua script: eval(script, numKeys, key, windowSeconds).
const evalKeys = (): string[] => redisMocks.eval.mock.calls.map((call) => call[2] as string);

const buildNext = () => vi.fn() as unknown as NextFunction;

describe("rateLimiter", () => {
  beforeEach(() => {
    redisMocks.ensureRedisConnection.mockResolvedValue(undefined);
    redisMocks.eval.mockResolvedValue(1);
    loggerMocks.error.mockReset();
    loggerMocks.info.mockReset();
  });

  it("skips requests without a matching policy", async () => {
    const next = buildNext();

    await rateLimiter(
      buildRequest({ method: "GET", path: "/login" }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(redisMocks.eval).not.toHaveBeenCalled();
  });

  it("uses Redis with an atomic increment-and-expire on each request", async () => {
    const next = buildNext();

    await rateLimiter(buildRequest(), {} as Response, next);

    expect(redisMocks.ensureRedisConnection).toHaveBeenCalled();
    expect(evalKeys()).toContain("rate-limit:login:127.0.0.1");
    // Key + window go to the atomic INCR/EXPIRE script in one call.
    expect(redisMocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("EXPIRE"),
      1,
      "rate-limit:login:127.0.0.1",
      600,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 429 after exceeding the configured limit", async () => {
    redisMocks.eval.mockResolvedValue(6);
    const next = buildNext();

    await rateLimiter(buildRequest(), {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: "RATE_LIMIT_EXCEEDED",
      }),
    );
  });

  it("applies the qr-resolve policy to GET requests matched to the /:token route", async () => {
    const next = buildNext();

    await rateLimiter(
      buildRequest({
        method: "GET",
        path: "/some-real-token-value",
        route: { path: "/:token" } as Request["route"],
      }),
      {} as Response,
      next,
    );

    expect(evalKeys()).toContain("rate-limit:qr-resolve:127.0.0.1");
    expect(next).toHaveBeenCalledWith();
  });

  it("does not rate-limit an unrelated GET request without a matching route", async () => {
    const next = buildNext();

    await rateLimiter(
      buildRequest({ method: "GET", path: "/me", route: undefined }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
    expect(redisMocks.eval).not.toHaveBeenCalled();
  });

  it("ignores a spoofed X-Forwarded-For header — buckets by request.ip only", async () => {
    const next = buildNext();

    await rateLimiter(
      buildRequest({ headers: { "x-forwarded-for": "1.2.3.4" } }),
      {} as Response,
      next,
    );

    expect(evalKeys()).toContain("rate-limit:login:127.0.0.1");
  });

  it("falls back to memory when Redis is unavailable", async () => {
    redisMocks.ensureRedisConnection.mockRejectedValue(new Error("redis down"));
    const requester = "fallback-test";

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const next = buildNext();
      await rateLimiter(
        buildRequest({ ip: requester }),
        {} as Response,
        next,
      );
      expect(next).toHaveBeenCalledWith();
    }

    const blockedNext = buildNext();
    await rateLimiter(
      buildRequest({ ip: requester }),
      {} as Response,
      blockedNext,
    );

    expect(blockedNext).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        code: "RATE_LIMIT_EXCEEDED",
      }),
    );
  });

  it("logs the degradation once, not on every request, while Redis stays down", async () => {
    // Fresh module instance: isDegradedToMemory is internal state that
    // persists across calls within the same module, so a clean import keeps
    // this test independent of whichever degraded/recovered state other
    // tests in this file left behind.
    vi.resetModules();
    redisMocks.ensureRedisConnection.mockRejectedValue(new Error("redis down"));
    const { rateLimiter: freshRateLimiter } = await import("../../../src/middleware/rateLimiter");

    await freshRateLimiter(buildRequest({ ip: "degraded-1" }), {} as Response, buildNext());
    await freshRateLimiter(buildRequest({ ip: "degraded-2" }), {} as Response, buildNext());
    await freshRateLimiter(buildRequest({ ip: "degraded-3" }), {} as Response, buildNext());

    expect(loggerMocks.error).toHaveBeenCalledTimes(1);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      expect.stringContaining("Redis unavailable"),
    );
  });

  it("logs a recovery message once Redis is reachable again after a degradation", async () => {
    vi.resetModules();
    redisMocks.ensureRedisConnection.mockRejectedValueOnce(new Error("redis down"));
    const { rateLimiter: freshRateLimiter } = await import("../../../src/middleware/rateLimiter");

    await freshRateLimiter(buildRequest({ ip: "recovery-1" }), {} as Response, buildNext());
    expect(loggerMocks.error).toHaveBeenCalledTimes(1);
    expect(loggerMocks.info).not.toHaveBeenCalled();

    redisMocks.ensureRedisConnection.mockResolvedValue(undefined);
    await freshRateLimiter(buildRequest({ ip: "recovery-1" }), {} as Response, buildNext());

    expect(loggerMocks.info).toHaveBeenCalledWith("Rate limiter recovered: back to Redis.");
  });

  describe("guest-turns: a shared venue IP must not lock out customers of the same business", () => {
    const BUSINESS = "11111111-1111-4111-8111-111111111111";
    const guestRequest = (body: unknown) =>
      buildRequest({ path: "/guest-turns", route: { path: "/guest-turns" } as Request["route"], body });

    // The Redis mock answers by key, so each bucket can be driven independently.
    const countsByKey = (counts: Record<string, number>) =>
      redisMocks.eval.mockImplementation(async (_script: string, _numKeys: number, key: string) => counts[key] ?? 1);

    it("counts both a coarse per-IP bucket and a tighter per-IP-per-business bucket", async () => {
      await rateLimiter(guestRequest({ businessId: BUSINESS }), {} as Response, buildNext());

      expect(evalKeys()).toContain("rate-limit:guest-turns:127.0.0.1");
      expect(evalKeys()).toContain(`rate-limit:guest-turns:scoped:127.0.0.1:${BUSINESS}`);
    });

    it("lets the 6th customer through — the old flat per-IP limit was 5", async () => {
      countsByKey({ "rate-limit:guest-turns:127.0.0.1": 6, [`rate-limit:guest-turns:scoped:127.0.0.1:${BUSINESS}`]: 6 });
      const next = buildNext();

      await rateLimiter(guestRequest({ businessId: BUSINESS }), {} as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("blocks once one business's scoped limit (20) is exceeded from a single IP", async () => {
      countsByKey({ [`rate-limit:guest-turns:scoped:127.0.0.1:${BUSINESS}`]: 21 });
      const next = buildNext();

      await rateLimiter(guestRequest({ businessId: BUSINESS }), {} as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429, code: "RATE_LIMIT_EXCEEDED" }));
    });

    it("still blocks on the coarse per-IP ceiling, so inventing business ids can't dodge it", async () => {
      countsByKey({ "rate-limit:guest-turns:127.0.0.1": 61 });
      const next = buildNext();

      await rateLimiter(guestRequest({ businessId: BUSINESS }), {} as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
    });

    it("ignores a missing or non-UUID businessId and falls back to the per-IP bucket only", async () => {
      for (const body of [undefined, {}, { businessId: 42 }, { businessId: "not-a-uuid" }]) {
        redisMocks.eval.mockClear();

        await rateLimiter(guestRequest(body), {} as Response, buildNext());

        expect(redisMocks.eval).toHaveBeenCalledTimes(1);
        expect(evalKeys()).toContain("rate-limit:guest-turns:127.0.0.1");
      }
    });
  });

  it("qr-resolve: adds a per-token bucket next to the per-IP one", async () => {
    await rateLimiter(
      buildRequest({
        method: "GET",
        path: "/abc123",
        route: { path: "/:token" } as Request["route"],
        params: { token: "abc123" },
      }),
      {} as Response,
      buildNext(),
    );

    expect(evalKeys()).toContain("rate-limit:qr-resolve:127.0.0.1");
    expect(evalKeys()).toContain("rate-limit:qr-resolve:scoped:127.0.0.1:abc123");
  });
});
