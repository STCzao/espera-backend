import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

const schema = z.object({
  turnId:          z.string().uuid("Invalid turn id."),
  serviceWindowId: z.string().uuid("Invalid service window id.").optional(),
});

export type AttendTurnInput = z.infer<typeof schema>;

export interface AttendTurnOutput {
  turnId: string;
  status: "attending" | "completed";
  startedAttentionAt?: string;
  attendedAt?: string;
}

export class AttendTurnUseCase implements UseCase<AttendTurnInput, AttendTurnOutput> {
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: AttendTurnInput): Promise<AttendTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");

    if (turn.status === "called") {
      const startedAttentionAt = new Date();
      const updated = await this.turnRepo.save({
        ...turn,
        status: "attending",
        startedAttentionAt,
        serviceWindowId: parsed.data.serviceWindowId ?? turn.serviceWindowId,
      });

      this.emitter?.emitQueueUpdate(updated.queueId, {
        attendingTurnId: updated.id,
        attendingDisplayNumber: updated.displayNumber,
      });

      return {
        turnId: updated.id,
        status: "attending",
        startedAttentionAt: startedAttentionAt.toISOString(),
      };
    }

    if (turn.status === "attending") {
      const attendedAt = new Date();
      const updated = await this.turnRepo.save({
        ...turn,
        status: "completed",
        attendedAt,
      });

      this.emitter?.emitQueueUpdate(updated.queueId, {
        attendedTurnId: updated.id,
        attendedDisplayNumber: updated.displayNumber,
      });

      return {
        turnId: updated.id,
        status: "completed",
        attendedAt: attendedAt.toISOString(),
      };
    }

    throw AppError.conflict("Only a called or attending turn can be progressed.", "TURN_INVALID_STATUS_FOR_ATTEND");
  }
}
