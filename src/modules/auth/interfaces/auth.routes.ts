import { Router } from "express";

import { authenticate } from "../../../middleware/authenticate";
import { authorize } from "../../../middleware/authorize";
import { rateLimiter } from "../../../middleware/rateLimiter";
import { AuthController } from "./AuthController";

const controller = new AuthController();

export const authRouter = Router();

authRouter.post("/register", rateLimiter, controller.register);
authRouter.get("/verify-email", controller.verifyEmail);
authRouter.post("/resend-verification", rateLimiter, controller.resendVerification);
authRouter.post("/forgot-password", rateLimiter, controller.requestPasswordReset);
authRouter.post("/reset-password", rateLimiter, controller.resetPassword);
authRouter.post("/login", rateLimiter, controller.login);
authRouter.post("/refresh-token", rateLimiter, controller.refreshToken);
authRouter.post("/logout", controller.logout);
authRouter.get("/me", authenticate, authorize("turn:read_own"), (request, response) => {
  response.status(200).json({ user: request.user });
});
