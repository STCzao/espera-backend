import { beforeEach, describe, expect, it, vi } from "vitest";

import { incrementWithExpiry } from "../../../src/shared/infrastructure/redisCounter";

const redisMocks = vi.hoisted(() => ({ eval: vi.fn() }));

vi.mock("../../../src/shared/infrastructure/redis", () => ({
  redis: { eval: redisMocks.eval },
}));

describe("incrementWithExpiry", () => {
  beforeEach(() => {
    redisMocks.eval.mockReset();
  });

  it("does INCR and EXPIRE inside a single script so the key can never exist without a TTL", async () => {
    redisMocks.eval.mockResolvedValue(1);

    await incrementWithExpiry("rate-limit:x:1.2.3.4", 600);

    expect(redisMocks.eval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, ttl] = redisMocks.eval.mock.calls[0];
    expect(script).toContain("INCR");
    expect(script).toContain("EXPIRE");
    expect([numKeys, key, ttl]).toEqual([1, "rate-limit:x:1.2.3.4", 600]);
  });

  it("returns the new counter value as a number", async () => {
    redisMocks.eval.mockResolvedValue("7");

    await expect(incrementWithExpiry("k", 60)).resolves.toBe(7);
  });
});
