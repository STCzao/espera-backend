import { z } from "zod";

const baseEnvSchema = z.object({
  API_PREFIX: z.string().default("/api"),
  APP_ORIGIN: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECRET: z.string().min(1, "COOKIE_SECRET is required."),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  GOOGLE_CLIENT_BUSINESS_ID: z.string().optional(),
  GOOGLE_CLIENT_BUSINESS_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required."),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  APP_URL: z.string().url().optional(),
  TRUST_PROXY: z.string().optional(),
});

const formatEnvErrors = (issues: z.ZodIssue[]): string =>
  issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`).join("; ");

const parsedEnv = baseEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${formatEnvErrors(parsedEnv.error.issues)}`);
}

export const env = parsedEnv.data;

const requireConfiguredValue = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} is required for this feature.`);
  }

  return value;
};

export const getAccessTokenSecret = (): string => env.JWT_ACCESS_SECRET;

/**
 * Parses `TRUST_PROXY` into what Express's `app.set("trust proxy", ...)`
 * expects (see https://expressjs.com/en/guide/behind-proxies.html). Defaults
 * to `false` (no proxy trusted, `req.ip` is the raw socket address) — a
 * spoofable `X-Forwarded-For` cannot influence rate limiting unless this is
 * explicitly configured for the real deployment topology (e.g. `"1"` for a
 * single reverse proxy hop, or a specific proxy IP/CIDR).
 */
export const parseTrustProxyValue = (raw: string | undefined): number | string | boolean => {
  if (!raw) return false;
  return /^\d+$/.test(raw) ? Number(raw) : raw;
};

export const getTrustProxySetting = (): number | string | boolean =>
  parseTrustProxyValue(env.TRUST_PROXY);

export const getGoogleOAuthConfig = () => ({
  callbackUrl: requireConfiguredValue(env.GOOGLE_CALLBACK_URL, "GOOGLE_CALLBACK_URL"),
  clientId: requireConfiguredValue(
    env.GOOGLE_CLIENT_ID ?? env.GOOGLE_CLIENT_BUSINESS_ID,
    "GOOGLE_CLIENT_ID",
  ),
  clientSecret: requireConfiguredValue(
    env.GOOGLE_CLIENT_SECRET ?? env.GOOGLE_CLIENT_BUSINESS_SECRET,
    "GOOGLE_CLIENT_SECRET",
  ),
});

export const getEmailConfig = () => ({
  appUrl: requireConfiguredValue(env.APP_URL, "APP_URL"),
  fromEmail: env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
  resendApiKey: requireConfiguredValue(env.RESEND_API_KEY, "RESEND_API_KEY"),
});
