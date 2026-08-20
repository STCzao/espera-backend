import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
});

export type CallNextInput = z.infer<typeof schema>;

export interface CallNextOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
}

export class CallNextUseCase implements UseCase<CallNextInput, CallNextOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: CallNextInput): Promise<CallNextOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");
    if (!queue.isActive) throw AppError.conflict("This queue is not active.", "QUEUE_NOT_ACTIVE");

    // A turn still "called" must be resolved explicitly — attended via
    // AttendTurnUseCase, or marked absent via MarkTurnNoShowUseCase — before
    // the queue can advance. This used to auto-supersede to "no_show" as a
    // silent side effect of calling next; the business wants that to be a
    // deliberate decision, not something that happens because someone
    // tapped "next" for any other reason.
    const calledTurn = await this.turnRepo.findCalledTurnByQueue(parsed.data.queueId);
    if (calledTurn) {
      throw AppError.conflict(
        "Resolve the currently called turn first — attend it or mark it as no-show.",
        "TURN_STILL_CALLED",
      );
    }

    const next = await this.turnRepo.findNextWaitingTurn(parsed.data.queueId);
    if (!next) {
      const pending = await this.turnRepo.hasPendingReservation(parsed.data.queueId);
      if (pending) {
        throw AppError.conflict(
          "There's a phone reservation that hasn't reached its estimated arrival time yet.",
          "QUEUE_NO_TURN_READY",
        );
      }
      throw AppError.conflict("The queue is empty.", "QUEUE_EMPTY");
    }

    const called = await this.turnRepo.save({
      ...next,
      status: "called",
      calledAt: new Date(),
    });

    this.emitter?.emitQueueUpdate(called.queueId, {
      calledTurnId: called.id,
      calledDisplayNumber: called.displayNumber,
    });

    return {
      turnId: called.id,
      queueId: called.queueId,
      displayNumber: called.displayNumber,
    };
  }
}
