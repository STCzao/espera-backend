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

/**
 * Placeholder turn creation flow.
 *
 * The real implementation must allocate sequential numbers, persist the turn,
 * publish realtime updates and enforce business availability.
 */
export class CreateTurnUseCase implements UseCase<CreateTurnInput, CreateTurnOutput> {
  public async execute(input: CreateTurnInput): Promise<CreateTurnOutput> {
    return {
      turnId: randomUUID(),
      queueId: input.queueId
    };
  }
}
