import { ensureRedisConnection, redis } from "./redis";

interface MemoryAttemptState {
  failedAttempts: number;
  blockedUntil?: number;
  expiresAt: number;
}

interface LoginAttemptStatus {
  failedAttempts: number;
  blockedUntil?: Date;
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const BLOCK_DURATION_SECONDS = 5 * 60;

// Backoffice accounts (HU-8.1) get a longer lockout than regular users
// (HU-1.3) after the same 5 failed attempts.
export const SUPER_ADMIN_BLOCK_DURATION_SECONDS = 15 * 60;

const memoryStore = new Map<string, MemoryAttemptState>();

const attemptsKey = (identity: string): string => `login-attempts:${identity}`;
const blockKey = (identity: string): string => `login-block:${identity}`;

const getMemoryStatus = (identity: string): LoginAttemptStatus => {
  const state = memoryStore.get(identity);
  const now = Date.now();

  if (!state || state.expiresAt <= now) {
    memoryStore.delete(identity);
    return { failedAttempts: 0 };
  }

  return {
    failedAttempts: state.failedAttempts,
    blockedUntil: state.blockedUntil ? new Date(state.blockedUntil) : undefined,
  };
};

const setMemoryStatus = (identity: string, status: LoginAttemptStatus): void => {
  memoryStore.set(identity, {
    failedAttempts: status.failedAttempts,
    blockedUntil: status.blockedUntil?.getTime(),
    expiresAt: Date.now() + ATTEMPT_WINDOW_SECONDS * 1000,
  });
};

export const getLoginAttemptStatus = async (
  identity: string,
): Promise<LoginAttemptStatus> => {
  try {
    await ensureRedisConnection();
    const [failedAttemptsRaw, blockedUntilRaw] = await redis.mget(
      attemptsKey(identity),
      blockKey(identity),
    );

    return {
      failedAttempts: Number(failedAttemptsRaw ?? "0"),
      blockedUntil: blockedUntilRaw ? new Date(Number(blockedUntilRaw)) : undefined,
    };
  } catch {
    return getMemoryStatus(identity);
  }
};

export const recordFailedLoginAttempt = async (
  identity: string,
  blockDurationSeconds: number = BLOCK_DURATION_SECONDS,
): Promise<LoginAttemptStatus> => {
  try {
    await ensureRedisConnection();

    const failedAttempts = await redis.incr(attemptsKey(identity));
    if (failedAttempts === 1) {
      await redis.expire(attemptsKey(identity), ATTEMPT_WINDOW_SECONDS);
    }

    let blockedUntil: Date | undefined;
    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      blockedUntil = new Date(Date.now() + blockDurationSeconds * 1000);
      await redis.set(blockKey(identity), blockedUntil.getTime().toString(), "EX", blockDurationSeconds);
      await redis.del(attemptsKey(identity));
    }

    return { failedAttempts, blockedUntil };
  } catch {
    const current = getMemoryStatus(identity);
    const failedAttempts = current.failedAttempts + 1;
    const blockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + blockDurationSeconds * 1000)
        : undefined;

    if (blockedUntil) {
      setMemoryStatus(identity, { failedAttempts: 0, blockedUntil });
    } else {
      setMemoryStatus(identity, { failedAttempts });
    }

    return { failedAttempts, blockedUntil };
  }
};

export const resetLoginAttemptStatus = async (identity: string): Promise<void> => {
  try {
    await ensureRedisConnection();
    await redis.del(attemptsKey(identity), blockKey(identity));
  } catch {
    memoryStore.delete(identity);
  }
};
