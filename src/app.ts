import "dotenv/config";
import "express-async-errors";

import http from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { Server as SocketIOServer } from "socket.io";

import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/interfaces/auth.routes";
import { createBusinessRouter } from "./modules/business/interfaces/business.routes";
import { qrRouter } from "./modules/business/interfaces/qr.routes";
import { organizationRouter } from "./modules/organization/interfaces/organization.routes";
import { createQueueRouter } from "./modules/queue/interfaces/queue.routes";
import { reportRouter } from "./modules/report/interfaces/report.routes";
import { PostgresTurnRepo } from "./modules/queue/infrastructure/PostgresTurnRepo";
import { authorizeQueueJoin } from "./modules/queue/infrastructure/realtime/authorizeQueueJoin";
import { SocketIOEmitter } from "./modules/queue/infrastructure/realtime/SocketIOEmitter";
import { env, getTrustProxySetting } from "./shared/infrastructure/env";
import { createShutdownHandler, isShuttingDown } from "./shared/infrastructure/gracefulShutdown";
import { logger } from "./shared/infrastructure/logger";
import { prisma } from "./shared/infrastructure/prisma";
import { ensureRedisConnection, redis } from "./shared/infrastructure/redis";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = 2_000): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    })
  ]);
};

// Shared by the HTTP API's cors() middleware and Socket.IO's own cors option
// below — both accept requests from the same origins, and a future
// tightening of APP_ORIGIN's allowlist logic (e.g. to a parsed multi-origin
// list) applied to only one of the two would leave the other transport
// accepting/reflecting any origin with credentials after the API was locked
// down.
const corsOptions = {
  origin: env.APP_ORIGIN ?? true,
  credentials: true,
};

export const createApp = (deps: { emitter?: SocketIOEmitter | null } = {}): express.Express => {
  const app = express();

  app.set("trust proxy", getTrustProxySetting());

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  app.get("/health", async (_request, response) => {
    const [db, cache] = await Promise.all([
      withTimeout(prisma.$queryRaw`SELECT 1`).then(() => true).catch(() => false),
      withTimeout(
        (async () => {
          await ensureRedisConnection();
          return await redis.ping();
        })()
      )
        .then((result) => result === "PONG")
        .catch(() => false)
    ]);

    // The status code answers one question only: should this instance be
    // sent traffic? Platform health checks (Render's healthCheckPath, the
    // Dockerfile's HEALTHCHECK) act on it, so it must not report failure for
    // something the app is built to survive.
    //
    // Redis down is exactly that: the rate limiter and the login attempt
    // tracker both fall back to a per-process memory store and say so in the
    // logs, and every other request path keeps working. Taking the instance
    // out of rotation over it would turn a documented degradation into an
    // outage. Postgres down is different — practically every route needs it —
    // and so is draining, where the point is to stop receiving new traffic.
    const status = isShuttingDown()
      ? "shutting_down"
      : !db
        ? "unavailable"
        : cache
          ? "ok"
          : "degraded";

    const canServeTraffic = status === "ok" || status === "degraded";

    response.status(canServeTraffic ? 200 : 503).json({
      status,
      db,
      cache,
      uptime: process.uptime()
    });
  });

  const apiPrefix = env.API_PREFIX;
  app.use(`${apiPrefix}/auth`, authRouter);
  app.use(`${apiPrefix}/business`, createBusinessRouter(deps.emitter ?? null));
  app.use(`${apiPrefix}/qr`, qrRouter);
  app.use(`${apiPrefix}/organizations`, organizationRouter);
  app.use(`${apiPrefix}/queue`, createQueueRouter(deps.emitter ?? null));
  app.use(`${apiPrefix}/reports`, reportRouter);
  app.use(errorHandler);

  return app;
};

export const createServer = () => {
  // Create the HTTP server before the app so that Socket.IO can attach to it
  // first, letting us pass the emitter into createApp.
  const server = http.createServer();

  const io = new SocketIOServer(server, {
    cors: corsOptions,
  });

  const emitter = new SocketIOEmitter(io);
  const app = createApp({ emitter });
  const turnRepo = new PostgresTurnRepo();

  // Attach Express as the request handler after both io and app are ready.
  server.on("request", app);

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on(
      "queue:join",
      // Guarded end to end: a malformed/missing payload (e.g. a client
      // emitting "queue:join" with no args at all) must not become an
      // unhandled rejection — Node terminates the whole process on those by
      // default, which would take down every connected client's realtime
      // connection over one bad event from a single socket.
      async (payload: { queueId?: string; turnId?: string } | undefined) => {
        try {
          const { queueId, turnId } = payload ?? {};
          const allowed = await authorizeQueueJoin({ queueId, turnId }, turnRepo);
          if (!allowed) {
            logger.warn(
              { socketId: socket.id, queueId, turnId },
              "Rejected queue:join",
            );
            return;
          }

          void socket.join(`queue:${queueId}`);
          logger.info({ socketId: socket.id, queueId, turnId }, "Socket joined queue room");
        } catch (error) {
          logger.warn({ socketId: socket.id, error }, "queue:join handler failed");
        }
      },
    );

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  });

  return { app, server, io };
};

if (require.main === module) {
  const { server, io } = createServer();

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "HTTP server listening");
  });

  const shutdown = createShutdownHandler({
    logger,
    targets: [
      {
        // io.close() also closes the HTTP server it is attached to: it stops
        // accepting connections, disconnects sockets and resolves once
        // in-flight requests finish. Idle keep-alive connections would keep
        // it waiting, so they are dropped explicitly.
        name: "http+socket.io",
        close: () =>
          new Promise<void>((resolve, reject) => {
            void io.close((error) => (error ? reject(error) : resolve()));
            server.closeIdleConnections();
          }),
      },
      {
        name: "redis",
        close: async () => {
          if (redis.status === "ready") await redis.quit();
          else redis.disconnect();
        },
      },
      { name: "prisma", close: () => prisma.$disconnect() },
    ],
  });

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
