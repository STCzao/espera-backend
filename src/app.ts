import "dotenv/config";
import "express-async-errors";

import http from "node:http";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { Server as SocketIOServer } from "socket.io";
import type { DefaultEventsMap } from "socket.io";

import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/interfaces/auth.routes";
import { createBusinessRouter } from "./modules/business/interfaces/business.routes";
import { qrRouter } from "./modules/business/interfaces/qr.routes";
import { organizationRouter } from "./modules/organization/interfaces/organization.routes";
import { createQueueRouter } from "./modules/queue/interfaces/queue.routes";
import { reportRouter } from "./modules/report/interfaces/report.routes";
import { EnsureBusinessMembershipUseCase } from "./modules/business";
import { PostgresQueueRepo } from "./modules/queue/infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "./modules/queue/infrastructure/PostgresTurnRepo";
import { authorizeQueueJoin } from "./modules/queue/infrastructure/realtime/authorizeQueueJoin";
import { SocketIOEmitter } from "./modules/queue/infrastructure/realtime/SocketIOEmitter";
import { env, getTrustProxySetting } from "./shared/infrastructure/env";
import { authenticateSocket } from "./middleware/authenticateSocket";
import type { AuthenticatedUserSnapshot } from "./middleware/loadAuthenticatedUser";
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

/** Per-socket state set by the handshake middleware in createServer. */
interface QueueSocketData {
  user: AuthenticatedUserSnapshot | null;
}

export const createServer = () => {
  // Create the HTTP server before the app so that Socket.IO can attach to it
  // first, letting us pass the emitter into createApp.
  const server = http.createServer();

  // The SocketData generic is what makes socket.data.user type-checked;
  // left to its default it is `any`, and a typo there would compile.
  const io = new SocketIOServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, QueueSocketData>(server, {
    cors: corsOptions,
  });

  const emitter = new SocketIOEmitter(io);
  const app = createApp({ emitter });
  const turnRepo = new PostgresTurnRepo();
  const queueRepo = new PostgresQueueRepo();
  const ensureBusinessMembership = new EnsureBusinessMembershipUseCase();

  // Composition root for the queue room guard: authorizeQueueJoin lives in
  // the queue module, which may not import the business module, so the
  // owner/employee rule is handed to it from here instead of duplicated.
  const queueJoinDeps = {
    turnRepo,
    queueRepo,
    assertStaffAccess: (businessId: string, userId: string) =>
      ensureBusinessMembership.execute({ businessId, userId }),
    requireStaffAuth: env.SOCKET_REQUIRE_STAFF_AUTH,
  };

  // Attach Express as the request handler after both io and app are ready.
  server.on("request", app);

  // Runs once per connection, before any event. A token that is missing,
  // expired or forged leaves the socket anonymous rather than refusing the
  // connection: the same endpoint serves the anonymous web-ligera visitor,
  // who never sends one. next() is therefore always called without an error.
  io.use(async (socket, next) => {
    try {
      const user = await authenticateSocket(socket.handshake.auth?.token);
      socket.data.user = user;
      if (!user && socket.handshake.auth?.token) {
        // Never log the token itself — it is a live credential.
        logger.warn({ socketId: socket.id }, "Socket handshake carried an unusable token");
      }
    } catch (error) {
      socket.data.user = null;
      logger.warn({ socketId: socket.id, error }, "Socket handshake authentication failed");
    }
    next();
  });

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
          const userId = socket.data.user?.id ?? null;
          const decision = await authorizeQueueJoin({ queueId, turnId, userId }, queueJoinDeps);

          if (!decision.allowed) {
            logger.warn(
              { socketId: socket.id, queueId, turnId, userId, reason: decision.reason },
              "Rejected queue:join",
            );
            return;
          }

          void socket.join(`queue:${queueId}`);

          if (decision.reason === "unauthenticated_legacy") {
            // Counting these is what says when SOCKET_REQUIRE_STAFF_AUTH can
            // be turned on: once no panel produces this any more, refusing
            // them costs nothing.
            logger.warn(
              { socketId: socket.id, queueId },
              "Socket joined a queue room with no authenticated staff session (legacy panel)",
            );
          }

          logger.info(
            { socketId: socket.id, queueId, turnId, userId, reason: decision.reason },
            "Socket joined queue room",
          );
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
