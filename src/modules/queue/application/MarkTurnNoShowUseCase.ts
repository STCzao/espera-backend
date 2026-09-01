import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { EnsureBusinessMembershipUseCase } from "@modules/business/public-api";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

const schema = z.object({
  turnId: z.string().uuid("Invalid turn id."),
  requestingUserId: z.string().uuid("Invalid user id."),
});

export type MarkTurnNoShowInput = z.infer<typeof schema>;

export interface MarkTurnNoShowOutput {
  turnId: string;
  status: "no_show";
  noShowAt: string;
}

/**
 * Explicit "mark as absent" action. CallNextUseCase used to flip a stale
 * "called" turn to no_show as a silent side effect of advancing the queue —
 * the business wants that to be a deliberate decision instead, so it's now
 * its own action and CallNextUseCase blocks (TURN_STILL_CALLED) until this
 * is used (or the turn is attended).
 *
 * No fairness/window-availability check here, on purpose: that check exists
 * to stop the *system* from blindly punishing someone via a mechanical
 * trigger. Once a human is explicitly asserting "this person isn't here",
 * they have better information than that heuristic — reusing it here would
 * just be friction against a deliberate call.
 */
export class MarkTurnNoShowUseCase
  implements UseCase<MarkTurnNoShowInput, MarkTurnNoShowOutput>
{
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
    private readonly ensureBusinessMembershipUseCase: EnsureBusinessMembershipUseCase = new EnsureBusinessMembershipUseCase(),
  ) {}

  public async execute(input: MarkTurnNoShowInput): Promise<MarkTurnNoShowOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");

    await this.ensureBusinessMembershipUseCase.execute({
      businessId: turn.businessId,
      userId: parsed.data.requestingUserId,
    });

    if (turn.status !== "called") {
      throw AppError.conflict("Only a called turn can be marked as no-show.", "TURN_NOT_CALLED");
    }

    const noShowAt = new Date();
    const updated = await this.turnRepo.save({
      ...turn,
      status: "no_show",
      noShowAt,
    });

    this.emitter?.emitQueueUpdate(updated.queueId, {
      noShowTurnId: updated.id,
      noShowDisplayNumber: updated.displayNumber,
    });

    return {
      turnId: updated.id,
      status: "no_show",
      noShowAt: noShowAt.toISOString(),
    };
  }
}
