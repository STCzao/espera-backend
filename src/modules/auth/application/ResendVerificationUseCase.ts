import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { sendVerificationEmail } from "@shared/infrastructure/email";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const resendVerificationSchema = z.object({
  email: z
    .string()
    .email("Token inválido.")
    .transform((value) => value.trim().toLowerCase())
});

const RESEND_COOLDOWN_MS = 5 * 60 * 1000;
const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export interface ResendVerificationOutput {
  message: string;
}

export class ResendVerificationUseCase
  implements UseCase<ResendVerificationInput, ResendVerificationOutput>
{
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo()
  ) {}

  public async execute(input: ResendVerificationInput): Promise<ResendVerificationOutput> {
    const parsed = resendVerificationSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest("Token inválido.");
    }

    const user = await this.userRepo.findByEmail(parsed.data.email);

    if (!user) {
      throw AppError.badRequest("Token inválido.");
    }

    if (user.isEmailVerified) {
      throw AppError.badRequest("El email ya fue verificado.");
    }

    if (
      user.lastVerificationSentAt &&
      Date.now() - user.lastVerificationSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      throw AppError.tooManyRequests("Esperá 5 minutos antes de solicitar otro email.");
    }

    const verificationToken = randomUUID();
    const verificationDate = new Date();
    const verificationExpiry = new Date(verificationDate.getTime() + VERIFICATION_EXPIRY_MS);

    const updatedUser = await this.userRepo.save({
      ...user,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
      lastVerificationSentAt: verificationDate,
      updatedAt: new Date()
    });

    try {
      await sendVerificationEmail(updatedUser.email, verificationToken);
    } catch {
      throw AppError.internal("Error al enviar el email de verificación. Intentá de nuevo.");
    }

    return { message: "Email de verificación reenviado." };
  }
}
