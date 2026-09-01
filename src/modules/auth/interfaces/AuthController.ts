import type { Request, Response } from "express";

import { AppError } from "@shared/kernel/AppError";
import { logger } from "@shared/infrastructure/logger";
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from "../../../middleware/refreshTokenCookie";
import {
  clearGoogleOAuthState,
  issueGoogleOAuthState,
  readGoogleOAuthState,
} from "../../../middleware/googleOAuthStateCookie";

import { LoginUseCase } from "../application/LoginUseCase";
import { LoginWithGoogleUseCase } from "../application/LoginWithGoogleUseCase";
import { LogoutUseCase } from "../application/LogoutUseCase";
import { RequestPasswordResetUseCase } from "../application/RequestPasswordResetUseCase";
import { ResendVerificationUseCase } from "../application/ResendVerificationUseCase";
import { RefreshTokenUseCase } from "../application/RefreshTokenUseCase";
import { RegisterUseCase } from "../application/RegisterUseCase";
import { ResetPasswordUseCase } from "../application/ResetPasswordUseCase";
import { VerifyEmailUseCase } from "../application/VerifyEmailUseCase";
import { RegisterBusinessAccountUseCase } from "../application/RegisterBusinessAccountUseCase";
import { RegisterBusinessWithGoogleUseCase } from "../application/RegisterBusinessWithGoogleUseCase";
import { ApproveBusinessAccountUseCase } from "../application/ApproveBusinessAccountUseCase";
import { UnblockUserUseCase } from "../application/UnblockUserUseCase";
import { GoogleOAuthService } from "../infrastructure/GoogleOAuthService";

export class AuthController {
  public constructor(
    private readonly loginUseCase = new LoginUseCase(),
    private readonly loginWithGoogleUseCase = new LoginWithGoogleUseCase(),
    private readonly logoutUseCase = new LogoutUseCase(),
    private readonly requestPasswordResetUseCase = new RequestPasswordResetUseCase(),
    private readonly resendVerificationUseCase = new ResendVerificationUseCase(),
    private readonly registerUseCase = new RegisterUseCase(),
    private readonly resetPasswordUseCase = new ResetPasswordUseCase(),
    private readonly refreshTokenUseCase = new RefreshTokenUseCase(),
    private readonly verifyEmailUseCase = new VerifyEmailUseCase(),
    private readonly registerBusinessAccountUseCase = new RegisterBusinessAccountUseCase(),
    private readonly registerBusinessWithGoogleUseCase = new RegisterBusinessWithGoogleUseCase(),
    private readonly approveBusinessAccountUseCase = new ApproveBusinessAccountUseCase(),
    private readonly unblockUserUseCase = new UnblockUserUseCase(),
    private readonly googleOAuthService = new GoogleOAuthService(),
  ) {}

  /**
   * Returns the Google OAuth authorization URL for business onboarding.
   */
  public getGoogleAuthorizationUrl = async (
    _request: Request,
    response: Response,
  ): Promise<void> => {
    const state = issueGoogleOAuthState(response);
    const url = this.googleOAuthService.getAuthorizationUrl(state);
    response.status(200).json({ url, state });
  };

  private assertValidGoogleOAuthState(
    request: Request,
    response: Response,
  ): string {
    const requestState =
      typeof request.body?.state === "string" ? request.body.state : "";
    const cookieState = readGoogleOAuthState(request);

    clearGoogleOAuthState(response);

    if (!requestState || !cookieState || requestState !== cookieState) {
      throw AppError.forbidden(
        "Invalid Google OAuth state.",
        "GOOGLE_OAUTH_STATE_MISMATCH",
      );
    }

    return requestState;
  }

  /**
   * Approves a pending business admin account.
   */
  public approveBusinessAccount = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const userId =
      typeof request.params.userId === "string" ? request.params.userId : "";

    const result = await this.approveBusinessAccountUseCase.execute({
      userId,
    });

    logger.info({ userId: result.userId }, "Business account approved");
    response.status(200).json(result);
  };

  /**
   * Reverses a User block (HU-8.6), restoring login access.
   */
  public unblockUser = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.unblockUserUseCase.execute({
      userId: String(request.params.userId),
      unblockedByUserId: request.user?.id ?? "",
    });

    logger.info({ userId: result.userId }, "User unblocked");
    response.status(200).json(result);
  };

  /**
   * Handles business account registration requests.
   */
  public registerBusinessAccount = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.registerBusinessAccountUseCase.execute(
      request.body,
    );
    logger.info(
      { userId: result.userId, businessId: result.businessId },
      "Business account registered",
    );
    response.status(201).json(result);
  };

  /**
   * Handles business account registration through Google OAuth.
   */
  public registerBusinessWithGoogle = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    this.assertValidGoogleOAuthState(request, response);

    const result = await this.registerBusinessWithGoogleUseCase.execute(
      request.body,
    );

    logger.info(
      { email: result.email, status: result.status, userId: result.userId },
      "Business account registration with Google processed",
    );

    response.status(200).json(result);
  };

  /**
   * Handles user registration requests.
   */
  public register = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.registerUseCase.execute(request.body);
    logger.info({ userId: result.userId }, "User registered");
    response.status(201).json(result);
  };

  /**
   * Handles email verification callbacks.
   */
  public verifyEmail = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const token =
      typeof request.query.token === "string" ? request.query.token : "";

    const result = await this.verifyEmailUseCase.execute({
      token,
    });
    response.status(200).json(result);
  };

  /**
   * Handles verification email resend requests.
   */
  public resendVerification = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.resendVerificationUseCase.execute(request.body);
    logger.info({ email: request.body.email }, "Verification email resent");
    response.status(200).json(result);
  };

  /**
   * Handles reset password requests and returns temporaly token by email for change the password
   */
  public requestPasswordReset = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.requestPasswordResetUseCase.execute(request.body);
    logger.info({ email: request.body.email }, "Password reset requested");
    response.status(200).json(result);
  };

  /**
   * Handles password reset confirmations.
   */
  public resetPassword = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.resetPasswordUseCase.execute(request.body);
    logger.info("Password reset completed");
    response.status(200).json(result);
  };

  /**
   * Handles login requests and returns session tokens.
   */
  public login = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const result = await this.loginUseCase.execute(request.body);
    setRefreshTokenCookie(response, result.refreshToken);
    logger.info({ email: request.body.email }, "User logged in");
    response.status(200).json(result);
  };

  /**
   * Handles Google OAuth login requests and returns session tokens.
   */
  public loginWithGoogle = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    this.assertValidGoogleOAuthState(request, response);

    const result = await this.loginWithGoogleUseCase.execute(request.body);
    setRefreshTokenCookie(response, result.refreshToken);
    logger.info("User logged in with Google");
    response.status(200).json(result);
  };

  /**
   * Handles refresh token exchange requests.
   */
  public refreshToken = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const token =
      request.cookies?.refreshToken ?? (request.body?.refreshToken as string);
    const result = await this.refreshTokenUseCase.execute({
      refreshToken: token ?? "",
    });
    setRefreshTokenCookie(response, result.refreshToken);
    response.status(200).json(result);
  };

  /**
   * Handles logout requests for authenticated users.
   */
  public logout = async (
    request: Request,
    response: Response,
  ): Promise<void> => {
    const token =
      request.cookies?.refreshToken ?? (request.body?.refreshToken as string);
    await this.logoutUseCase.execute({
      refreshToken: token ?? "",
    });
    clearRefreshTokenCookie(response);
    response.status(200).json({ message: "Logged out successfully." });
  };
}
