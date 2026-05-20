import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";

import { LoginUseCase } from "../application/LoginUseCase";
import { ResendVerificationUseCase } from "../application/ResendVerificationUseCase";
import { RefreshTokenUseCase } from "../application/RefreshTokenUseCase";
import { RegisterUseCase } from "../application/RegisterUseCase";
import { VerifyEmailUseCase } from "../application/VerifyEmailUseCase";

export class AuthController {
  public constructor(
    private readonly loginUseCase = new LoginUseCase(),
    private readonly resendVerificationUseCase = new ResendVerificationUseCase(),
    private readonly registerUseCase = new RegisterUseCase(),
    private readonly refreshTokenUseCase = new RefreshTokenUseCase(),
    private readonly verifyEmailUseCase = new VerifyEmailUseCase()
  ) {}

  public register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.registerUseCase.execute(request.body);
    logger.info({ userId: result.userId }, "User registered");
    response.status(201).json(result);
  };

  public verifyEmail = async (request: Request, response: Response): Promise<void> => {
    const result = await this.verifyEmailUseCase.execute({
      token: request.query.token as string
    });
    response.status(200).json(result);
  };

  public resendVerification = async (request: Request, response: Response): Promise<void> => {
    const result = await this.resendVerificationUseCase.execute(request.body);
    logger.info({ email: request.body.email }, "Verification email resent");
    response.status(200).json(result);
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
