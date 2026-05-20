import { randomUUID } from "node:crypto";

import type { UseCase } from "../../../shared/kernel/UseCase";

export interface CreateTurnInput {
  queueId: string;
  customerId?: string;
}

export interface CreateTurnOutput {
  turnId: string;
  queueId: string;
}

export class CreateTurnUseCase implements UseCase<CreateTurnInput, CreateTurnOutput> {
  public async execute(input: CreateTurnInput): Promise<CreateTurnOutput> {
    return {
      turnId: randomUUID(),
      queueId: input.queueId
    };
  }
}
