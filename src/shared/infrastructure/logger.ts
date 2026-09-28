import pino from "pino";

// pino-http's default req/res serializers (used by the access-log middleware
// in app.ts, which shares this same logger instance) include the full
// request headers and the response's Set-Cookie header — without redact,
// every request logs the live Authorization bearer token and the
// refreshToken/googleOAuthState cookies in plain text to stdout/whatever log
// sink is configured, readable by anyone with log access. Exported
// separately (instead of only inline below) so logger.test.ts can build a
// second pino instance with these exact options against an in-memory stream,
// proving the redaction actually happens instead of just asserting config.
export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
    censor: "[REDACTED]",
  },
};

export const logger = pino(loggerOptions);
