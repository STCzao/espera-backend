import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { TurnPriority } from "../domain/Turn";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

export type ConfirmAction = "in_transit" | "arrived";

const TRANSITIONS: Record<ConfirmAction, { from: TurnPriority; to: TurnPriority }> = {
  in_transit: { from: "registered", to: "in_transit" },
  arrived:    { from: "in_transit",  to: "arrived" },
};

const schema = z.object({
  queueId:    z.string().uuid("Invalid queue id."),
  customerId: z.string().uuid("Invalid customer id."),
  action:     z.enum(["in_transit", "arrived"]),
});

export type ConfirmTurnStatusInput = z.infer<typeof schema>;

export interface ConfirmTurnStatusOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
  priority: TurnPriority;
}

export class ConfirmTurnStatusUseCase
  implements UseCase<ConfirmTurnStatusInput, ConfirmTurnStatusOutput>
{
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: ConfirmTurnStatusInput): Promise<ConfirmTurnStatusOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { queueId, customerId, action } = parsed.data;

    const turn = await this.turnRepo.findActiveByCustomerInQueue(customerId, queueId);
    if (!turn) throw AppError.notFound("No active turn found in this queue.", "TURN_NOT_FOUND");

    const { from, to } = TRANSITIONS[action];
    if (turn.priority !== from) {
      throw AppError.conflict(
        `Cannot confirm ${action}: current priority is "${turn.priority}".`,
        "TURN_INVALID_STATUS_FOR_ATTEND",
      );
    }

    const updated = await this.turnRepo.save({ ...turn, priority: to });

    this.emitter?.emitQueueUpdate(queueId, {
      updatedTurnId: updated.id,
      updatedPriority: updated.priority,
    });

    return {
      turnId:        updated.id,
      queueId:       updated.queueId,
      displayNumber: updated.displayNumber,
      priority:      updated.priority,
    };
  }
}
