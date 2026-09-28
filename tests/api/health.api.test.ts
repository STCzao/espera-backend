import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app";
import { resetShutdownStateForTests } from "../../src/shared/infrastructure/gracefulShutdown";

const infraMocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  ensureRedisConnection: vi.fn(),
  ping: vi.fn(),
}));

vi.mock("../../src/shared/infrastructure/prisma", () => ({
  prisma: { $queryRaw: infraMocks.queryRaw },
}));

vi.mock("../../src/shared/infrastructure/redis", () => ({
  ensureRedisConnection: infraMocks.ensureRedisConnection,
  redis: { ping: infraMocks.ping },
}));

const getHealth = () => request(createApp()).get("/health");

describe("GET /health", () => {
  beforeEach(() => {
    resetShutdownStateForTests();
    infraMocks.queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
    infraMocks.ensureRedisConnection.mockReset().mockResolvedValue(undefined);
    infraMocks.ping.mockReset().mockResolvedValue("PONG");
  });

  afterEach(() => {
    resetShutdownStateForTests();
  });

  it("reports ok when both Postgres and Redis answer", async () => {
    const response = await getHealth();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", db: true, cache: true });
  });

  it("stays in rotation with Redis down: the rate limiter and login tracker fall back to memory", async () => {
    infraMocks.ping.mockRejectedValue(new Error("redis is gone"));

    const response = await getHealth();

    // 200 on purpose — a 503 here would take the instance out of service over
    // a degradation the app is built to survive.
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "degraded", db: true, cache: false });
  });

  it("goes out of rotation when Postgres is unreachable: nearly every route needs it", async () => {
    infraMocks.queryRaw.mockRejectedValue(new Error("db is gone"));

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: "unavailable", db: false, cache: true });
  });

  it("goes out of rotation while draining, even with every dependency healthy", async () => {
    const { createShutdownHandler } = await import("../../src/shared/infrastructure/gracefulShutdown");
    await createShutdownHandler({
      logger: { info: vi.fn(), error: vi.fn() },
      exit: vi.fn(),
      targets: [],
    })("SIGTERM");

    const response = await getHealth();

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: "shutting_down" });
  });
});
