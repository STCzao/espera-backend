import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";
import { saveTurnOrThrowConflict } from "./saveTurnOrThrowConflict";

const schema = z.object({
  turnId: z.string().uuid("Invalid turn id."),
});

export type CancelGuestTurnInput = z.infer<typeof schema>;

export interface CancelGuestTurnOutput {
  cancelled: true;
  turnId: string;
}

/**
 * Lets a web-ligera visitor (HU-4.2) leave the queue. Same trust model as
 * GetGuestTurnStatusUseCase: the turnId — an unguessable UUID handed out
 * once, at creation — is the access key, since there is no login. That key
 * only ever works for *guest* turns: a turn that belongs to an app customer
 * is theirs to cancel with their session (CancelTurnUseCase), so knowing its
 * id (which queue broadcasts include) must not be enough to cancel it.
 *
 * Only a still-`waiting` turn can be cancelled this way. The queue room is
 * joinable without credentials (see authorizeQueueJoin), and its broadcasts
 * carry the ids of turns being called, attended or redirected — so an
 * eavesdropper could otherwise cancel someone else's turn the moment it is
 * called. The ids of waiting turns are never broadcast, so for those the
 * "only the holder knows the id" assumption still holds.
 */
export class CancelGuestTurnUseCase implements UseCase<CancelGuestTurnInput, CancelGuestTurnOutput> {
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: CancelGuestTurnInput): Promise<CancelGuestTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");

    if (turn.customerId) {
      throw AppError.forbidden("This turn belongs to an account and must be cancelled from it.", "TURN_NOT_GUEST");
    }
    if (turn.status !== "waiting") {
      throw AppError.conflict(
        "Only a waiting turn can be cancelled online. Please tell the staff at the counter.",
        "TURN_NOT_CANCELLABLE",
      );
    }

    const cancelled = await saveTurnOrThrowConflict(this.turnRepo, {
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
