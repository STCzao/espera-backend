import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import { resolveTurnWaitStatus } from "./resolveTurnWaitStatus";

const schema = z.object({
  turnId: z.string().uuid("Invalid turn id."),
});

export type GetGuestTurnStatusInput = z.infer<typeof schema>;

export interface GetGuestTurnStatusOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
  status: "waiting" | "called" | "attending" | "redirected" | "cancelled" | "completed" | "no_show";
  position: number;
  estimatedWaitMinutes: number | null;
  serviceWindowId: string | null;
}

/**
 * Public polling endpoint for HU-4.2 (web ligera) — no login, so there is no
 * customerId to look the turn up by. The turnId itself is the access key:
 * a random UUID, unguessable and not enumerable, same trust model already
 * used for QR tokens (see BusinessQrUrl). Anyone who doesn't already have
 * the turnId (returned once, at creation) cannot poll someone else's turn.
 */
export class GetGuestTurnStatusUseCase
  implements UseCase<GetGuestTurnStatusInput, GetGuestTurnStatusOutput>
{
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: GetGuestTurnStatusInput): Promise<GetGuestTurnStatusOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");

    // Unlike GetMyTurnUseCase (scoped to active turns via
    // findActiveByCustomerInQueue), a guest can poll a turnId that already
    // finished — resolveTurnWaitStatus only knows about the active states.
    // no_show is terminal too: without this branch it falls through to the
    // "still waiting" calculation below and reports a position/wait time
    // for a turn that was already skipped.
    if (turn.status === "cancelled" || turn.status === "completed" || turn.status === "no_show") {
      return {
        turnId: turn.id,
        queueId: turn.queueId,
        displayNumber: turn.displayNumber,
        status: turn.status,
        position: 0,
        estimatedWaitMinutes: null,
        serviceWindowId: turn.serviceWindowId ?? null,
      };
    }

    const waitStatus = await resolveTurnWaitStatus(turn, {
      turnRepo: this.turnRepo,
      windowRepo: this.windowRepo,
    });

    return {
      turnId: turn.id,
      queueId: turn.queueId,
      displayNumber: turn.displayNumber,
      ...waitStatus,
    };
  }
}
