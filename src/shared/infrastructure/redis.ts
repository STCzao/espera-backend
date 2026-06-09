import Redis from "ioredis";

import { env } from "./env";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});

export const ensureRedisConnection = async (): Promise<void> => {
  if (redis.status === "ready" || redis.status === "connecting") {
    return;
  }

  await redis.connect();
};
