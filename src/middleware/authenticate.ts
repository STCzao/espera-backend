import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { getAccessTokenSecret } from "@shared/infrastructure/env";
import { ACCESS_TOKEN_ALGORITHM } from "@modules/auth/public-api";
import { AppError } from "@shared/kernel/AppError";
import { loadAuthenticatedUser } from "./loadAuthenticatedUser";

type AccessTokenPayload = JwtPayload & { sub: string };

/**
 * Validates short-lived bearer tokens and attaches the authenticated principal
 * to the request. Fine-grained business ownership is resolved later by the
 * application layer.
 *
 * The token only proves who the caller is: role, approval status and the
 * blocked flag are re-read from the database on every request, so blocking a
 * user, approving an account or changing a role takes effect immediately
 * instead of when the (up to 15 min) access token expires. The cost is one
 * primary-key lookup per authenticated request.
 */
export const authenticate = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
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

  let decoded: AccessTokenPayload;
  try {
    decoded = jwt.verify(token, secret, { algorithms: [ACCESS_TOKEN_ALGORITHM] }) as AccessTokenPayload;
  } catch {
    next(AppError.unauthorized("Invalid or expired access token."));
    return;
  }

  try {
    const user = await loadAuthenticatedUser(decoded.sub);
    if (!user) {
      next(AppError.unauthorized("Invalid or expired access token."));
      return;
    }
    if (user.isBlocked) {
      next(AppError.forbidden("Your account has been blocked.", "ACCOUNT_BLOCKED"));
      return;
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Reads the opaque refresh token from the HTTP-only cookie.
 *
 * The database lookup and rotation happen in RefreshTokenUseCase so this
 * middleware stays transport-only.
 */
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
