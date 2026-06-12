import Redis from "ioredis";

import { env } from "./env";
import { logger } from "./logger";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false
});

redis.on("error", (error) => {
  logger.warn({ err: error }, "Redis connection error; using fallback when available");
});

export const ensureRedisConnection = async (): Promise<void> => {
  if (redis.status === "ready" || redis.status === "connecting") {
    return;
  }

  await redis.connect();
};
