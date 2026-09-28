import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { ensureRedisConnection, redis } from "../../src/shared/infrastructure/redis";
import { incrementWithExpiry } from "../../src/shared/infrastructure/redisCounter";

/**
 * The unit test only proves the script text is sent; this proves real Redis
 * accepts it and that the key gets its TTL on creation, together with the
 * increment, and keeps counting on later calls.
 */
describe("incrementWithExpiry (real Redis)", () => {
  const key = `test:redis-counter:${randomUUID()}`;

  afterAll(async () => {
    await redis.del(key);
    redis.disconnect();
  });

  it("creates the key with a TTL and keeps counting without resetting it", async () => {
    await ensureRedisConnection();

    expect(await incrementWithExpiry(key, 120)).toBe(1);
    const ttlAfterFirst = await redis.ttl(key);
    expect(ttlAfterFirst).toBeGreaterThan(0);
    expect(ttlAfterFirst).toBeLessThanOrEqual(120);

    expect(await incrementWithExpiry(key, 120)).toBe(2);
    expect(await incrementWithExpiry(key, 120)).toBe(3);
    expect(await redis.ttl(key)).toBeGreaterThan(0);
  });
});
