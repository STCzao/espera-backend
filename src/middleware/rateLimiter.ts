import type { NextFunction, Request, Response } from "express";

import { ensureRedisConnection, redis } from "@shared/infrastructure/redis";
import { AppError } from "@shared/kernel/AppError";

interface RateLimitPolicy {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

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
  "POST /guest-turns":                 { bucket: "guest-turns",               limit: 5,  windowSeconds: 10 * 60 },
  "GET /:token":                       { bucket: "qr-resolve",                limit: 30, windowSeconds: 60 },
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

const consumeFromMemory = (key: string, policy: RateLimitPolicy): number => {
  const now = Date.now();
  const existing = memoryStore.get(key);

  if (!existing || existing.expiresAt <= now) {
    memoryStore.set(key, {
      count: 1,
      expiresAt: now + policy.windowSeconds * 1000,
    });

    return 1;
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return existing.count;
};

const consumeFromRedis = async (
  key: string,
  policy: RateLimitPolicy,
): Promise<number> => {
  await ensureRedisConnection();
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, policy.windowSeconds);
  }

  return count;
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
  const key = `rate-limit:${policy.bucket}:${requesterKey}`;

  let count: number;

  try {
    count = await consumeFromRedis(key, policy);
  } catch {
    count = consumeFromMemory(key, policy);
  }

  if (count > policy.limit) {
    next(
      AppError.tooManyRequests(
        "Too many requests. Please try again later.",
        "RATE_LIMIT_EXCEEDED",
      ),
    );
    return;
  }

  next();
};
