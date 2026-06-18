import type { UseCase } from "../../../shared/kernel/UseCase";

export interface CancelTurnInput {
  turnId: string;
}

export interface CancelTurnOutput {
  cancelled: true;
  turnId: string;
}

/**
 * Placeholder cancellation flow.
 *
 * The real implementation must validate ownership, persist the status change
 * and notify queue observers.
 */
export class CancelTurnUseCase implements UseCase<CancelTurnInput, CancelTurnOutput> {
  public async execute(input: CancelTurnInput): Promise<CancelTurnOutput> {
    return {
      cancelled: true,
      turnId: input.turnId
    };
  }
}
