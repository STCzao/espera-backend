import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createShutdownHandler,
  isShuttingDown,
  resetShutdownStateForTests,
} from "../../../src/shared/infrastructure/gracefulShutdown";

const buildLogger = () => ({ info: vi.fn(), error: vi.fn() });

describe("createShutdownHandler", () => {
  beforeEach(() => {
    resetShutdownStateForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes every target in order, one at a time, then exits 0", async () => {
    const order: string[] = [];
    const exit = vi.fn();
    const handler = createShutdownHandler({
      logger: buildLogger(),
      exit,
      targets: [
        { name: "http", close: async () => { order.push("http:start"); await Promise.resolve(); order.push("http:end"); } },
        { name: "redis", close: () => { order.push("redis"); } },
        { name: "prisma", close: async () => { order.push("prisma"); } },
      ],
    });

    await handler("SIGTERM");

    expect(order).toEqual(["http:start", "http:end", "redis", "prisma"]);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("keeps closing the remaining targets when one fails, and exits 1", async () => {
    const logger = buildLogger();
    const exit = vi.fn();
    const prismaClose = vi.fn();
    const handler = createShutdownHandler({
      logger,
      exit,
      targets: [
        { name: "redis", close: async () => { throw new Error("boom"); } },
        { name: "prisma", close: prismaClose },
      ],
    });

    await handler("SIGINT");

    expect(prismaClose).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ target: "redis" }), "Shutdown step failed");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("forces exit 1 when a target hangs past the timeout", async () => {
    const exit = vi.fn();
    const handler = createShutdownHandler({
      logger: buildLogger(),
      exit,
      timeoutMs: 5_000,
      targets: [{ name: "http", close: () => new Promise<void>(() => {}) }],
    });

    void handler("SIGTERM");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("ignores a second signal while already draining", async () => {
    const exit = vi.fn();
    const close = vi.fn();
    const handler = createShutdownHandler({ logger: buildLogger(), exit, targets: [{ name: "x", close }] });

    await Promise.all([handler("SIGTERM"), handler("SIGINT")]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("flags the process as shutting down so /health can tell the load balancer to drain", async () => {
    expect(isShuttingDown()).toBe(false);
    const handler = createShutdownHandler({ logger: buildLogger(), exit: vi.fn(), targets: [] });

    await handler("SIGTERM");

    expect(isShuttingDown()).toBe(true);
  });
});
