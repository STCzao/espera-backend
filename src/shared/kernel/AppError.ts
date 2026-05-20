export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  public constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  public static badRequest(message: string): AppError {
    return new AppError(400, message);
  }

  public static unauthorized(message: string): AppError {
    return new AppError(401, message);
  }

  public static forbidden(message: string): AppError {
    return new AppError(403, message);
  }

  public static notFound(message: string): AppError {
    return new AppError(404, message);
  }

  public static conflict(message: string): AppError {
    return new AppError(409, message);
  }

  public static internal(message = "Internal server error."): AppError {
    return new AppError(500, message, false);
  }
}
