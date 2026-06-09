import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { getAccessTokenSecret } from "@shared/infrastructure/env";
import { AppError } from "@shared/kernel/AppError";

type AccessTokenPayload = JwtPayload & {
  sub: string;
  email: string;
  role: "user" | "employee" | "business_admin" | "super_admin";
  approvalStatus: "pending" | "approved" | "rejected";
  businessId?: string;
};

export const authenticate = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader?.startsWith("Bearer ")) {
    next(AppError.unauthorized("Missing or invalid bearer token."));
    return;
  }

  const token = authorizationHeader.replace("Bearer ", "").trim();
  let secret: string;

  try {
    secret = getAccessTokenSecret();
  } catch {
    next(AppError.internal("JWT access token configuration is invalid."));
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as AccessTokenPayload;

    request.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      businessId: decoded.businessId,
      approvalStatus: decoded.approvalStatus,
    };

    next();
  } catch {
    next(AppError.unauthorized("Invalid or expired access token."));
  }
};

export const authenticateRefresh = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  const token = request.cookies?.refreshToken;

  if (!token || typeof token !== "string") {
    next(AppError.unauthorized("Missing refresh token."));
    return;
  }

  request.refreshToken = token;
  next();
};
