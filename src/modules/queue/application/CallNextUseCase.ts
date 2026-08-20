import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
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
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: CallNextInput): Promise<CallNextOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");
    if (!queue.isActive) throw AppError.conflict("This queue is not active.", "QUEUE_NOT_ACTIVE");

    // A turn still "called" here was never confirmed as attending. That's
    // only fair to treat as a no-show if it actually had somewhere to go —
    // calling someone else forward while every active window is still busy
    // with the previous person (the "heads up, start walking" overlap) must
    // not punish them for a window that was never free in the first place.
    const calledTurn = await this.turnRepo.findCalledTurnByQueue(parsed.data.queueId);
    if (calledTurn) {
      const activeWindows = (await this.windowRepo.findByQueueId(parsed.data.queueId))
        .filter((w) => w.isActive);
      if (activeWindows.length > 0) {
        const occupants = await Promise.all(
          activeWindows.map((w) => this.turnRepo.findAttendingByServiceWindow(w.id)),
        );
        const hadFreeWindow = occupants.some((occupant) => occupant === null);
        if (!hadFreeWindow) {
          throw AppError.conflict(
            "The currently called turn hasn't had a free service window yet — can't call another one forward.",
            "QUEUE_NO_WINDOW_AVAILABLE",
          );
        }
      }

      await this.turnRepo.save({
        ...calledTurn,
        status: "no_show",
        noShowAt: new Date(),
      });
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
