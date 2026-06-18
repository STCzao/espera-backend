import { randomUUID } from "node:crypto";

import type { UseCase } from "../../../shared/kernel/UseCase";

export interface CallNextInput {
  queueId: string;
}

export interface CallNextOutput {
  turnId: string;
  queueId: string;
}

/**
 * Placeholder call-next flow.
 *
 * The real implementation must select the next waiting turn, mark it as called
 * atomically and notify connected clients.
 */
export class CallNextUseCase implements UseCase<CallNextInput, CallNextOutput> {
  public async execute(input: CallNextInput): Promise<CallNextOutput> {
    return {
      turnId: randomUUID(),
      queueId: input.queueId
    };
  }
}
