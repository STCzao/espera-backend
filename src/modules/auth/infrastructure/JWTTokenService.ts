import { createHash, randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env, getAccessTokenSecret } from "@shared/infrastructure/env";

import type { User } from "../domain/User";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class JWTTokenService {
  /**
   * Creates a signed JWT access token for an authenticated user.
   */
  public generateAccessToken(user: User): string {
    const expiresIn = env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"];

    return jwt.sign(
      {
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        approvalStatus: user.approvalStatus,
      },
      getAccessTokenSecret(),
      {
        subject: user.id,
        expiresIn
      }
    );
  }

  /**
   * Generates a new opaque refresh token and its database-safe hash.
   */
  public generateRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("hex");
    // SHA-256 is enough here because refresh tokens are already high-entropy random secrets.
    const hash = createHash("sha256").update(token).digest("hex");

    return { token, hash };
  }

  /**
   * Derives the persisted lookup hash for a refresh token received from the client.
   */
  public hashRefreshToken(token: string): string {
    // Hashing keeps plaintext refresh tokens out of storage while preserving deterministic lookup.
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Returns the absolute expiry date for a newly issued refresh token.
   */
  public getRefreshTokenExpiryDate(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  }
}
