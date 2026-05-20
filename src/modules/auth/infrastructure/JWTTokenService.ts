import jwt, { type SignOptions } from "jsonwebtoken";

import type { User } from "../domain/User";

export class JWTTokenService {
  public generateAccessToken(user: User): string {
    const expiresIn = (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m") as SignOptions["expiresIn"];

    return jwt.sign(
      {
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      },
      process.env.JWT_ACCESS_SECRET ?? "development-access-secret",
      {
        subject: user.id,
        expiresIn
      }
    );
  }

  public generateRefreshToken(user: User): string {
    const expiresIn = (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];

    return jwt.sign(
      {
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName
      },
      process.env.JWT_REFRESH_SECRET ?? "development-refresh-secret",
      {
        subject: user.id,
        expiresIn
      }
    );
  }
}
