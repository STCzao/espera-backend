import { randomUUID } from "node:crypto";

import type { UseCase } from "../../../shared/kernel/UseCase";

export interface CallNextInput {
  queueId: string;
}

export interface CallNextOutput {
  turnId: string;
  queueId: string;
}

export class CallNextUseCase implements UseCase<CallNextInput, CallNextOutput> {
  public async execute(input: CallNextInput): Promise<CallNextOutput> {
    return {
      turnId: randomUUID(),
      queueId: input.queueId
    };
  }
}
