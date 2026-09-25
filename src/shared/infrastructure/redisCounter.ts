import { redis } from "./redis";

// INCR and EXPIRE as two separate commands leave a gap: if the process dies
// (or the connection drops) after the INCR that creates the key but before
// the EXPIRE, the counter lives forever and whoever it counts is locked out
// permanently. Redis runs a script atomically, so the key can never exist
// without its TTL.
const INCREMENT_WITH_EXPIRY_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

/**
 * Increments a fixed-window counter and returns its new value, setting the
 * window's TTL atomically the first time the key is created. The caller must
 * have awaited `ensureRedisConnection()`.
 */
export const incrementWithExpiry = async (key: string, windowSeconds: number): Promise<number> =>
  Number(await redis.eval(INCREMENT_WITH_EXPIRY_SCRIPT, 1, key, windowSeconds));
