import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { LoginUseCase } from "../application/LoginUseCase";
import { RefreshTokenUseCase } from "../application/RefreshTokenUseCase";
import { RegisterUseCase } from "../application/RegisterUseCase";

export class AuthController {
  public constructor(
    private readonly loginUseCase = new LoginUseCase(),
    private readonly registerUseCase = new RegisterUseCase(),
    private readonly refreshTokenUseCase = new RefreshTokenUseCase()
  ) {}

  public register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.registerUseCase.execute(request.body);
    logger.info({ userId: result.userId }, "User registered");
    response.status(201).json(result);
  };

  public login = async (request: Request, response: Response): Promise<void> => {
    const result = await this.loginUseCase.execute(request.body);
    logger.info({ email: request.body.email }, "User logged in");
    response.status(200).json(result);
  };

  public refreshToken = async (request: Request, response: Response): Promise<void> => {
    const result = await this.refreshTokenUseCase.execute(request.body);
    response.status(200).json(result);
  };
}
