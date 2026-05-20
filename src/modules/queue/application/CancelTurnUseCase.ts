import type { UseCase } from "../../../shared/kernel/UseCase";

export interface CancelTurnInput {
  turnId: string;
}

export interface CancelTurnOutput {
  cancelled: true;
  turnId: string;
}

export class CancelTurnUseCase implements UseCase<CancelTurnInput, CancelTurnOutput> {
  public async execute(input: CancelTurnInput): Promise<CancelTurnOutput> {
    return {
      cancelled: true,
      turnId: input.turnId
    };
  }
}
