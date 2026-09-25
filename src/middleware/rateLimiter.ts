import type { NextFunction, Request, Response } from "express";

import { ensureRedisConnection, redis } from "@shared/infrastructure/redis";
import { logger } from "@shared/infrastructure/logger";
import { AppError } from "@shared/kernel/AppError";

interface RateLimitPolicy {
  bucket: string;
  limit: number;
  windowSeconds: number;
  /**
   * Second, tighter bucket keyed by IP *and* a request-derived scope (e.g.
   * the business being scanned). The plain per-IP bucket alone punishes
   * whole venues: every customer on a shop's wifi shares one public IP, so
   * a small per-IP limit locks out the sixth person scanning the same QR.
   * The IP-only bucket stays as a coarse ceiling so a client can't dodge
   * limits by inventing scope values.
   */
  scoped?: {
    limit: number;
    scope: (request: Request) => string | undefined;
  };
}

interface RateLimitCheck {
  key: string;
  limit: number;
  windowSeconds: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SCOPE_LENGTH = 128;

const businessIdFromBody = (request: Request): string | undefined => {
  const value = (request.body as { businessId?: unknown } | undefined)?.businessId;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : undefined;
};

const tokenFromParams = (request: Request): string | undefined => {
  const value = request.params?.token;
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SCOPE_LENGTH ? value : undefined;
};

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

// Tracked so the Redis-down warning logs once per degradation episode
// instead of once per request — a sustained outage (or an attacker's own
// flood of requests) would otherwise flood the logs right when they're
// least useful. See rateLimiter().
let isDegradedToMemory = false;

// Keyed by "METHOD path" so a GET route is exactly as visible here as a
// POST one — the previous POST-only switch made every non-POST route an
// unwritten special case, which is exactly how GET /google/url ended up
// wired to `rateLimiter` with no policy actually matching it (caught by
// tests/unit/middleware/rateLimiterCoverage.test.ts, which now guards this
// table against drifting from the real route wiring).
const POLICIES: Record<string, RateLimitPolicy> = {
  "POST /login":                       { bucket: "login",                     limit: 5,  windowSeconds: 10 * 60 },
  "POST /login/google":                { bucket: "login-google",              limit: 10, windowSeconds: 10 * 60 },
  "GET /google/url":                   { bucket: "google-oauth-url",          limit: 20, windowSeconds: 10 * 60 },
  "POST /register":                    { bucket: "register",                  limit: 5,  windowSeconds: 60 * 60 },
  "POST /register-business":           { bucket: "register-business",         limit: 5,  windowSeconds: 60 * 60 },
  "POST /register-business/google":    { bucket: "register-business-google",  limit: 10, windowSeconds: 10 * 60 },
  "POST /forgot-password":             { bucket: "forgot-password",           limit: 3,  windowSeconds: 15 * 60 },
  "POST /resend-verification":         { bucket: "resend-verification",       limit: 3,  windowSeconds: 15 * 60 },
  "POST /reset-password":              { bucket: "reset-password",            limit: 5,  windowSeconds: 10 * 60 },
  "POST /refresh-token":               { bucket: "refresh-token",             limit: 20, windowSeconds: 10 * 60 },
  "POST /guest-turns":                 { bucket: "guest-turns",               limit: 60,  windowSeconds: 10 * 60, scoped: { limit: 20, scope: businessIdFromBody } },
  "GET /:token":                       { bucket: "qr-resolve",                limit: 120, windowSeconds: 60,      scoped: { limit: 30, scope: tokenFromParams } },
};

const getPolicy = (request: Request): RateLimitPolicy | null => {
  // request.route.path is the matched route *pattern* (e.g. "/:token"), set
  // by Express before invoking route-specific middleware — falls back to
  // request.path for the literal (param-free) routes below, where both are
  // identical anyway.
  const routePath = request.route?.path ?? request.path;
  return POLICIES[`${request.method} ${routePath}`] ?? null;
};

/**
 * `request.ip` already resolves `X-Forwarded-For` according to Express's
 * `trust proxy` setting (see env.ts's `getTrustProxySetting`) — reading the
 * header directly here would let any client pick its own rate-limit bucket
 * by sending a different fake value on every request.
 */
const getRequesterKey = (request: Request): string => request.ip || "unknown";

const consumeFromMemory = (key: string, windowSeconds: number): number => {
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || existing.expiresAt <= now) {
    memoryStore.set(key, {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    });

    return 1;
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return existing.count;
};

const consumeFromRedis = async (
  key: string,
  windowSeconds: number,
): Promise<number> => {
  await ensureRedisConnection();
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return count;
};

const consume = async (check: RateLimitCheck): Promise<number> => {
  try {
    const count = await consumeFromRedis(check.key, check.windowSeconds);
    if (isDegradedToMemory) {
      isDegradedToMemory = false;
      logger.info("Rate limiter recovered: back to Redis.");
    }
    return count;
  } catch (error) {
    if (!isDegradedToMemory) {
      isDegradedToMemory = true;
      // Per-process memory means each app instance behind a load balancer
      // enforces its own separate limit — an N-instance deployment
      // effectively multiplies every configured limit by N for as long as
      // this lasts, so it needs to be loud, not just a silent fallback.
      logger.error(
        { error },
        "Rate limiter degraded: Redis unavailable, falling back to per-process memory store.",
      );
    }
    return consumeFromMemory(check.key, check.windowSeconds);
  }
};

export const rateLimiter = async (
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> => {
  const policy = getPolicy(request);
  if (!policy) {
    next();
    return;
  }

  const requesterKey = getRequesterKey(request);
  const checks: RateLimitCheck[] = [
    {
      key: `rate-limit:${policy.bucket}:${requesterKey}`,
      limit: policy.limit,
      windowSeconds: policy.windowSeconds,
    },
  ];

  const scope = policy.scoped?.scope(request);
  if (policy.scoped && scope) {
    checks.push({
      key: `rate-limit:${policy.bucket}:scoped:${requesterKey}:${scope}`,
      limit: policy.scoped.limit,
      windowSeconds: policy.windowSeconds,
    });
  }

  for (const check of checks) {
    const count = await consume(check);
    if (count > check.limit) {
      next(
        AppError.tooManyRequests(
          "Too many requests. Please try again later.",
          "RATE_LIMIT_EXCEEDED",
        ),
      );
      return;
    }
  }

  next();
};
