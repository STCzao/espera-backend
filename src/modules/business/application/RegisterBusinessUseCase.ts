import { randomUUID } from "node:crypto";

import type { UseCase } from "../../../shared/kernel/UseCase";

export interface RegisterBusinessInput {
  name: string;
  slug: string;
  categoryId: string;
}

export interface RegisterBusinessOutput {
  businessId: string;
}

export class RegisterBusinessUseCase
  implements UseCase<RegisterBusinessInput, RegisterBusinessOutput>
{
  public async execute(_input: RegisterBusinessInput): Promise<RegisterBusinessOutput> {
    return {
      businessId: randomUUID()
    };
  }
}
