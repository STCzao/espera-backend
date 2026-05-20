import type { ErrorRequestHandler } from "express";

import { logger } from "@shared/infrastructure/logger";
import { AppError } from "@shared/kernel/AppError";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    if (!error.isOperational) {
      logger.error({ err: error }, "Unexpected AppError");
    }

    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  logger.error({ err: error }, "Unhandled error");
  res.status(500).json({ message: "Internal server error." });
};
