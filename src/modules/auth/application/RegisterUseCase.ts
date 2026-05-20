import { randomUUID } from "node:crypto";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "../../../shared/kernel/UseCase";

export interface RegisterInput {
  email: string;
  password: string;
  role?: "user" | "employee" | "business_admin" | "super_admin";
}

export interface RegisterOutput {
  userId: string;
}

export class RegisterUseCase implements UseCase<RegisterInput, RegisterOutput> {
  public async execute(input: RegisterInput): Promise<RegisterOutput> {
    if (!input.email || !input.password) {
      throw AppError.badRequest("Email and password are required.");
    }

    return {
      userId: randomUUID()
    };
  }
}
