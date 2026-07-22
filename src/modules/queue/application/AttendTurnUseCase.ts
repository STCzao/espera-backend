import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

const schema = z.object({
  turnId: z.string().uuid("Invalid turn id."),
});

export type AttendTurnInput = z.infer<typeof schema>;

export interface AttendTurnOutput {
  attended: true;
  turnId: string;
  attendedAt: string;
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
    if (!turn) throw AppError.notFound("Turn not found.");
    if (turn.status !== "called") {
      throw AppError.conflict("Only a called turn can be marked as attended.");
    }

    const attendedAt = new Date();
    const attended = await this.turnRepo.save({
      ...turn,
      status: "completed", 
      attendedAt,
    });

    this.emitter?.emitQueueUpdate(attended.queueId, {
      attendedTurnId: attended.id,
      attendedDisplayNumber: attended.displayNumber,
    });

    return {
      attended:   true,
      turnId:     attended.id,
      attendedAt: attendedAt.toISOString(),
    };
  }
}
