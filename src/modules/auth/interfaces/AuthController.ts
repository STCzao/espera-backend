import type { Request, Response } from "express";

import { logger } from "@shared/infrastructure/logger";
import { clearRefreshTokenCookie, setRefreshTokenCookie } from "../../../middleware/refreshTokenCookie";

import { LoginUseCase } from "../application/LoginUseCase";
import { LogoutUseCase } from "../application/LogoutUseCase";
import { ResendVerificationUseCase } from "../application/ResendVerificationUseCase";
import { RefreshTokenUseCase } from "../application/RefreshTokenUseCase";
import { RegisterUseCase } from "../application/RegisterUseCase";
import { VerifyEmailUseCase } from "../application/VerifyEmailUseCase";

export class AuthController {
  public constructor(
    private readonly loginUseCase = new LoginUseCase(),
    private readonly logoutUseCase = new LogoutUseCase(),
    private readonly resendVerificationUseCase = new ResendVerificationUseCase(),
    private readonly registerUseCase = new RegisterUseCase(),
    private readonly refreshTokenUseCase = new RefreshTokenUseCase(),
    private readonly verifyEmailUseCase = new VerifyEmailUseCase()
  ) {}

  /**
   * Handles user registration requests.
   */
  public register = async (request: Request, response: Response): Promise<void> => {
    const result = await this.registerUseCase.execute(request.body);
    logger.info({ userId: result.userId }, "User registered");
    response.status(201).json(result);
  };

  /**
   * Handles email verification callbacks.
   */
  public verifyEmail = async (request: Request, response: Response): Promise<void> => {
    const result = await this.verifyEmailUseCase.execute({
      token: request.query.token as string
    });
    response.status(200).json(result);
  };

  /**
   * Handles verification email resend requests.
   */
  public resendVerification = async (request: Request, response: Response): Promise<void> => {
    const result = await this.resendVerificationUseCase.execute(request.body);
    logger.info({ email: request.body.email }, "Verification email resent");
    response.status(200).json(result);
  };

  /**
   * Handles login requests and returns session tokens.
   */
  public login = async (request: Request, response: Response): Promise<void> => {
    const result = await this.loginUseCase.execute(request.body);
    setRefreshTokenCookie(response, result.refreshToken);
    logger.info({ email: request.body.email }, "User logged in");
    response.status(200).json(result);
  };

  /**
   * Handles refresh token exchange requests.
   */
  public refreshToken = async (request: Request, response: Response): Promise<void> => {
    const token = request.cookies?.refreshToken ?? (request.body?.refreshToken as string);
    const result = await this.refreshTokenUseCase.execute({
      refreshToken: token ?? ""
    });
    setRefreshTokenCookie(response, result.refreshToken);
    response.status(200).json(result);
  };

  /**
   * Handles logout requests for authenticated users.
   */
  public logout = async (request: Request, response: Response): Promise<void> => {
    const token = request.cookies?.refreshToken ?? (request.body?.refreshToken as string);
    await this.logoutUseCase.execute({
      refreshToken: token ?? ""
    });
    clearRefreshTokenCookie(response);
    response.status(200).json({ message: "Logged out successfully." });
  };
}
