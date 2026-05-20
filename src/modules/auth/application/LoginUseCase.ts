import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { JWTTokenService } from "../infrastructure/JWTTokenService";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const loginSchema = z.object({
  email: z.string().email("Email inválido."),
  password: z.string().min(1, "La contraseña es obligatoria.")
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface LoginOutput {
  accessToken: string;
  refreshToken: string;
}

export class LoginUseCase implements UseCase<LoginInput, LoginOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly tokenService = new JWTTokenService()
  ) {}

  public async execute(input: LoginInput): Promise<LoginOutput> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (!user?.passwordHash) {
      throw AppError.unauthorized("Credenciales inválidas.");
    }

    const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!passwordMatches) {
      throw AppError.unauthorized("Credenciales inválidas.");
    }

    if (!user.isEmailVerified) {
      throw AppError.forbidden("Debés verificar tu email antes de iniciar sesión.");
    }

    return {
      accessToken: this.tokenService.generateAccessToken(user),
      refreshToken: this.tokenService.generateRefreshToken(user)
    };
  }
}
