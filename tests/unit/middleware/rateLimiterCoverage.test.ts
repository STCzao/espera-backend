import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { Router } from "express";

import { rateLimiter } from "../../../src/middleware/rateLimiter";
import { authRouter } from "../../../src/modules/auth/interfaces/auth.routes";
import { createBusinessRouter } from "../../../src/modules/business/interfaces/business.routes";
import { qrRouter } from "../../../src/modules/business/interfaces/qr.routes";
import { createQueueRouter } from "../../../src/modules/queue/interfaces/queue.routes";
import { organizationRouter } from "../../../src/modules/organization/interfaces/organization.routes";
import { reportRouter } from "../../../src/modules/report/interfaces/report.routes";

const redisMocks = vi.hoisted(() => ({
  ensureRedisConnection: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/redis", () => ({
  ensureRedisConnection: redisMocks.ensureRedisConnection,
  redis: {
    incr: redisMocks.incr,
    expire: redisMocks.expire,
  },
}));

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown }>;
  };
}

/**
 * Finds every route in a Router whose middleware chain includes
 * `rateLimiter`, by walking Express's own internal route table — not a
 * hand-maintained list that can drift from the real wiring.
 */
const findRateLimitedRoutes = (router: Router): Array<{ method: string; path: string }> => {
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  const found: Array<{ method: string; path: string }> = [];

  for (const layer of layers) {
    if (!layer.route) continue;
    const usesRateLimiter = layer.route.stack.some((handler) => handler.handle === rateLimiter);
    if (!usesRateLimiter) continue;

    for (const method of Object.keys(layer.route.methods)) {
      found.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }

  return found;
};

const buildNext = () => vi.fn() as unknown as NextFunction;

describe("rate limiter coverage — every route wiring the middleware has a matching policy", () => {
  beforeEach(() => {
    redisMocks.ensureRedisConnection.mockReset().mockResolvedValue(undefined);
    redisMocks.incr.mockReset().mockResolvedValue(1);
    redisMocks.expire.mockReset().mockResolvedValue(1);
  });

  const routers: Array<[string, Router]> = [
    ["auth", authRouter],
    ["qr", qrRouter],
    ["business", createBusinessRouter(null)],
    ["queue", createQueueRouter(null)],
    ["organization", organizationRouter],
    ["report", reportRouter],
  ];

  for (const [name, router] of routers) {
    const rateLimitedRoutes = findRateLimitedRoutes(router);

    if (rateLimitedRoutes.length === 0) continue;

    describe(name, () => {
      for (const { method, path } of rateLimitedRoutes) {
        it(`${method} ${path} has a real rate-limit policy, not a silent no-op`, async () => {
          const request = {
            method,
            path,
            route: { path },
            headers: {},
            ip: "127.0.0.1",
          } as unknown as Request;

          await rateLimiter(request, {} as Response, buildNext());

          // getPolicy() isn't exported — the middleware only ever touches
          // Redis when a policy actually matched, so this is the
          // observable proxy for "this route is really being limited".
          expect(redisMocks.incr).toHaveBeenCalled();
        });
      }
    });
  }
});
