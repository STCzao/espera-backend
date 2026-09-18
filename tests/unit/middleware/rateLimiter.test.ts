import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { rateLimiter } from "../../../src/middleware/rateLimiter";

const redisMocks = vi.hoisted(() => ({
  ensureRedisConnection: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/redis", () => ({
  ensureRedisConnection: redisMocks.ensureRedisConnection,
  redis: {
    incr: redisMocks.incr,
    expire: redisMocks.expire,
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

const buildNext = () => vi.fn() as unknown as NextFunction;

describe("rateLimiter", () => {
  beforeEach(() => {
    redisMocks.ensureRedisConnection.mockResolvedValue(undefined);
    redisMocks.incr.mockResolvedValue(1);
    redisMocks.expire.mockResolvedValue(1);
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
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it("uses Redis and sets expiry on first request in a window", async () => {
    const next = buildNext();

    await rateLimiter(buildRequest(), {} as Response, next);

    expect(redisMocks.ensureRedisConnection).toHaveBeenCalled();
    expect(redisMocks.incr).toHaveBeenCalledWith("rate-limit:login:127.0.0.1");
    expect(redisMocks.expire).toHaveBeenCalledWith(
      "rate-limit:login:127.0.0.1",
      600,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 429 after exceeding the configured limit", async () => {
    redisMocks.incr.mockResolvedValue(6);
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

    expect(redisMocks.incr).toHaveBeenCalledWith("rate-limit:qr-resolve:127.0.0.1");
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
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it("ignores a spoofed X-Forwarded-For header — buckets by request.ip only", async () => {
    const next = buildNext();

    await rateLimiter(
      buildRequest({ headers: { "x-forwarded-for": "1.2.3.4" } }),
      {} as Response,
      next,
    );

    expect(redisMocks.incr).toHaveBeenCalledWith("rate-limit:login:127.0.0.1");
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
});
