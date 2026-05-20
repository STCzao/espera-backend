import type { NextFunction, Request, Response } from "express";

export const rateLimiter = (
  _request: Request,
  _response: Response,
  next: NextFunction
): void => {
  next();
};
