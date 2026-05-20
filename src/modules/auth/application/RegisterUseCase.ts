import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import { domainEventBus } from "@shared/EventBus";
import { sendVerificationEmail } from "@shared/infrastructure/email";
import type { UseCase } from "@shared/kernel/UseCase";

import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const nameRegex = /^[\p{L}\s'\-]+$/u;

const registerSchema = z.object({
  email: z
    .string({ required_error: "El email es obligatorio." })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .email("Email inválido.")
        .max(254, "El email no puede superar los 254 caracteres.")
        .transform((value) => value.toLowerCase())
    ),
  password: z
    .string({ required_error: "La contraseña es obligatoria." })
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña no puede superar los 72 caracteres.")
    .regex(
      passwordRegex,
      "La contraseña debe tener al menos una mayúscula, una minúscula y un número."
    ),
  firstName: z
    .string({ required_error: "El nombre es obligatorio." })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(2, "El nombre debe tener al menos 2 caracteres.")
        .max(50, "El nombre no puede superar los 50 caracteres.")
        .regex(nameRegex, "El nombre solo puede contener letras.")
    ),
  lastName: z
    .string({ required_error: "El apellido es obligatorio." })
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(2, "El apellido debe tener al menos 2 caracteres.")
        .max(50, "El apellido no puede superar los 50 caracteres.")
        .regex(nameRegex, "El apellido solo puede contener letras.")
    )
});

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type RegisterInput = z.infer<typeof registerSchema>;

export interface RegisterOutput {
  userId: string;
}

export class RegisterUseCase implements UseCase<RegisterInput, RegisterOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo()
  ) {}

  public async execute(input: RegisterInput): Promise<RegisterOutput> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const { email, password, firstName, lastName } = parsed.data;

    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw AppError.conflict("El email ya está en uso.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomUUID();
    const verificationDate = new Date();
    const verificationExpiry = new Date(verificationDate.getTime() + VERIFICATION_EXPIRY_MS);

    const user = await this.userRepo.save({
      id: randomUUID(),
      email,
      firstName,
      lastName,
      passwordHash,
      role: "user",
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiry: verificationExpiry,
      lastVerificationSentAt: verificationDate,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch {
      await this.userRepo.delete(user.id);
      throw AppError.internal("Error al enviar el email de verificación. Intentá de nuevo.");
    }

    domainEventBus.emit("user.registered", {
      userId: user.id,
      email: user.email
    });

    return {
      userId: user.id
    };
  }
}
