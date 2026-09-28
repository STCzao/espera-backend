process.env.API_PREFIX = process.env.API_PREFIX ?? "/api";
process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET ?? "test-cookie-secret-at-least-32-chars-long";
process.env.DATABASE_URL =
process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/espera_test";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-access-secret-at-least-32-chars-long";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";
process.env.NODE_ENV = "test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_key";
