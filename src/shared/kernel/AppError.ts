/**
 * Represents an application-level error with an HTTP status code and operational flag.
 * Operational errors are expected failures that can be safely exposed and logged differently.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  public constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    code?: string,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    // Non-operational errors usually indicate unexpected server failures.
    this.isOperational = isOperational;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Creates a 400 Bad Request error.
   */
  public static badRequest(message: string, code?: string): AppError {
    return new AppError(400, message, true, code);
  }

  /**
   * Creates a 401 Unauthorized error.
   */
  public static unauthorized(message: string, code?: string): AppError {
    return new AppError(401, message, true, code);
  }

  /**
   * Creates a 403 Forbidden error.
   */
  public static forbidden(message: string, code?: string): AppError {
    return new AppError(403, message, true, code);
  }

  /**
   * Creates a 404 Not Found error.
   */
  public static notFound(message: string, code?: string): AppError {
    return new AppError(404, message, true, code);
  }

  /**
   * Creates a 409 Conflict error.
   */
  public static conflict(message: string, code?: string): AppError {
    return new AppError(409, message, true, code);
  }

  /**
   * Creates a 429 Too Many Requests error.
   */
  public static tooManyRequests(message: string, code?: string): AppError {
    return new AppError(429, message, true, code);
  }

  /**
   * Creates a 500 Internal Server Error.
   */
  public static internal(message = "Internal server error.", code?: string): AppError {
    return new AppError(500, message, false, code);
  }
}
