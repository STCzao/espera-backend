import { Prisma } from "@prisma/client";
import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
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
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: AttendTurnInput): Promise<AttendTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");

    if (turn.status === "called" || turn.status === "redirected") {
      const targetWindowId = parsed.data.serviceWindowId ?? turn.serviceWindowId;

      if (!targetWindowId) {
        // A queue with configured windows must route attention through one
        // — otherwise two turns can end up "attending" at once with no way
        // to tell they're colliding (the occupancy check below only runs
        // against a window id). A queue with none configured is a
        // single-counter setup where this doesn't apply.
        const windows = await this.windowRepo.findByQueueId(turn.queueId);
        if (windows.some((w) => w.isActive)) {
          throw AppError.badRequest(
            "A service window must be selected for this queue.",
            "SERVICE_WINDOW_REQUIRED",
          );
        }
      }

      if (targetWindowId) {
        const occupant = await this.turnRepo.findAttendingByServiceWindow(targetWindowId);
        if (occupant && occupant.id !== turn.id) {
          throw AppError.conflict("This service window is already attending another turn.", "SERVICE_WINDOW_OCCUPIED");
        }
      }

      const startedAttentionAt = turn.startedAttentionAt ?? new Date();
      let updated;
      try {
        updated = await this.turnRepo.save({
          ...turn,
          status: "attending",
          startedAttentionAt,
          serviceWindowId: targetWindowId,
        });
      } catch (error) {
        // Safety net for the race the check above can't fully close: two
        // concurrent attend calls can both read "free" before either
        // writes. The DB's partial unique index (one ATTENDING/REDIRECTED
        // turn per serviceWindowId) rejects the second write — surface it
        // as the same conflict the in-app check already reports.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw AppError.conflict("This service window is already attending another turn.", "SERVICE_WINDOW_OCCUPIED");
        }
        throw error;
      }

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
