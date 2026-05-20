import jwt from "jsonwebtoken";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RefreshTokenOutput {
  accessToken: string;
}

export class RefreshTokenUseCase
  implements UseCase<RefreshTokenInput, RefreshTokenOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly tokenService = new JWTTokenService()
  ) {}

  public async execute(input: RefreshTokenInput): Promise<RefreshTokenOutput> {
    if (!input.refreshToken) {
      throw AppError.badRequest("Token inválido.");
    }

    try {
      const payload = jwt.verify(
        input.refreshToken,
        process.env.JWT_REFRESH_SECRET ?? "development-refresh-secret"
      ) as jwt.JwtPayload;

      const user = await this.userRepo.findById(payload.sub!);
      if (!user) {
        throw AppError.unauthorized("Token inválido.");
      }

      return { accessToken: this.tokenService.generateAccessToken(user) };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw AppError.unauthorized("Token inválido o expirado.");
    }
  }
}
