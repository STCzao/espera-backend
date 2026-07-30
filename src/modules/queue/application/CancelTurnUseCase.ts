import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

const schema = z.object({
  turnId: z.string().uuid("Invalid turn id."),
  customerId: z.string().uuid("Invalid customer id."),
});

export type CancelTurnInput = z.infer<typeof schema>;

export interface CancelTurnOutput {
  cancelled: true;
  turnId: string;
}

export class CancelTurnUseCase implements UseCase<CancelTurnInput, CancelTurnOutput> {
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: CancelTurnInput): Promise<CancelTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");
    if (turn.customerId !== parsed.data.customerId) {
      throw AppError.forbidden("You can only cancel your own turn.", "TURN_NOT_OWNED");
    }
    if (turn.status !== "waiting" && turn.status !== "called") {
      throw AppError.conflict("This turn cannot be cancelled.", "TURN_NOT_CANCELLABLE");
    }

    const cancelled = await this.turnRepo.save({
      ...turn,
      status: "cancelled",
      cancelledAt: new Date(),
    });

    this.emitter?.emitQueueUpdate(cancelled.queueId, {
      cancelledTurnId: cancelled.id,
      cancelledDisplayNumber: cancelled.displayNumber,
    });

    return { cancelled: true, turnId: cancelled.id };
  }
}
