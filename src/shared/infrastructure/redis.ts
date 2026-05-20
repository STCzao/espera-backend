import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
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
