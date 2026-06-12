import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { errorHandler } from "../../../src/middleware/errorHandler";
import { AppError } from "../../../src/shared/kernel/AppError";

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock("../../../src/shared/infrastructure/logger", () => ({
  logger: {
    error: loggerMocks.error,
  },
}));

const buildResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

describe("errorHandler", () => {
  beforeEach(() => {
    loggerMocks.error.mockClear();
  });

  it("serializes operational AppError responses", () => {
    const response = buildResponse();

    errorHandler(
      AppError.forbidden("Forbidden action.", "FORBIDDEN_ACTION"),
      {} as Request,
      response,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      message: "Forbidden action.",
      code: "FORBIDDEN_ACTION",
    });
    expect(loggerMocks.error).not.toHaveBeenCalled();
  });

  it("logs non-operational AppError responses", () => {
    const response = buildResponse();

    errorHandler(
      AppError.internal("Unexpected internal failure.", "INTERNAL_FAILURE"),
      {} as Request,
      response,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Unexpected internal failure.",
      code: "INTERNAL_FAILURE",
    });
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(AppError) }),
      "Unexpected AppError",
    );
  });

  it("hides unhandled error details behind a generic 500", () => {
    const response = buildResponse();

    errorHandler(
      new Error("database exploded"),
      {} as Request,
      response,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Internal server error.",
    });
    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unhandled error",
    );
  });
});
