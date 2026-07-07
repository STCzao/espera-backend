import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { rateLimiter } from "../../../middleware/rateLimiter";
import { AuthController } from "./AuthController";

const controller = new AuthController();

export const authRouter = Router();

authRouter.post("/register", rateLimiter, controller.register);
// @deprecated — backlog v2.2 removed the one-step signup flow (HU-1.8).
// New flow: POST /api/auth/register → verify email → login → POST /api/business.
// These routes remain until the frontend migrates.
authRouter.post(
  "/register-business",
  rateLimiter,
  controller.registerBusinessAccount,
);
authRouter.get("/google/url", rateLimiter, controller.getGoogleAuthorizationUrl);
authRouter.post("/register/google", rateLimiter, controller.registerWithGoogle);
// @deprecated — flujo previo a v2.2 del backlog. Usar POST /register/google + POST /api/business.
authRouter.post(
  "/register-business/google",
  rateLimiter,
  controller.registerBusinessWithGoogle,
);
authRouter.patch(
  "/business-accounts/:userId/approve",
  authenticate,
  authorize("platform:approve_business_account"),
  controller.approveBusinessAccount,
);
authRouter.get("/verify-email", controller.verifyEmail);
authRouter.post(
  "/resend-verification",
  rateLimiter,
  controller.resendVerification,
);
authRouter.post(
  "/forgot-password",
  rateLimiter,
  controller.requestPasswordReset,
);
authRouter.post("/reset-password", rateLimiter, controller.resetPassword);
authRouter.post("/login", rateLimiter, controller.login);
authRouter.post("/login/google", rateLimiter, controller.loginWithGoogle);
authRouter.post("/refresh-token", rateLimiter, controller.refreshToken);
authRouter.post("/logout", controller.logout);
authRouter.get(
  "/me",
  authenticate,
  authorize("auth:read_self"),
  (request, response) => {
    response.status(200).json({ user: request.user });
  },
);
