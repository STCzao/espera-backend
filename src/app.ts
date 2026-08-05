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
import { SocketIOEmitter } from "./modules/queue/infrastructure/realtime/SocketIOEmitter";
import { env } from "./shared/infrastructure/env";
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

export const createApp = (deps: { emitter?: SocketIOEmitter | null } = {}): express.Express => {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.APP_ORIGIN ?? true,
      credentials: true
    })
  );
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

    const status = db && cache ? "ok" : "degraded";

    response.status(status === "ok" ? 200 : 503).json({
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
  app.use(errorHandler);

  return app;
};

export const createServer = () => {
  // Create the HTTP server before the app so that Socket.IO can attach to it
  // first, letting us pass the emitter into createApp.
  const server = http.createServer();

  const io = new SocketIOServer(server, {
    cors: {
      origin: env.APP_ORIGIN ?? true,
      credentials: true
    }
  });

  const emitter = new SocketIOEmitter(io);
  const app = createApp({ emitter });

  // Attach Express as the request handler after both io and app are ready.
  server.on("request", app);

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("queue:join", ({ queueId }: { queueId: string }) => {
      void socket.join(`queue:${queueId}`);
      logger.info({ socketId: socket.id, queueId }, "Socket joined queue room");
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });
  });

  return { app, server, io };
};

if (require.main === module) {
  const { server } = createServer();

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "HTTP server listening");
  });
}
