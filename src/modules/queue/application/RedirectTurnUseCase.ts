import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import type { SocketIOEmitter } from "../infrastructure/realtime/SocketIOEmitter";

const schema = z.object({
  turnId:                z.string().uuid("Invalid turn id."),
  targetServiceWindowId: z.string().uuid("Invalid service window id."),
});

export type RedirectTurnInput = z.infer<typeof schema>;

export interface RedirectTurnOutput {
  turnId: string;
  status: "redirected";
  serviceWindowId: string;
}

export class RedirectTurnUseCase implements UseCase<RedirectTurnInput, RedirectTurnOutput> {
  public constructor(
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: RedirectTurnInput): Promise<RedirectTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const turn = await this.turnRepo.findById(parsed.data.turnId);
    if (!turn) throw AppError.notFound("Turn not found.", "TURN_NOT_FOUND");

    if (turn.status !== "attending") {
      throw AppError.conflict("Only a turn currently being attended can be redirected.", "TURN_INVALID_STATUS_FOR_ATTEND");
    }

    if (turn.serviceWindowId === parsed.data.targetServiceWindowId) {
      throw AppError.badRequest("Cannot redirect a turn to the service window it is already in.", "REDIRECT_SAME_WINDOW");
    }

    const targetWindow = await this.windowRepo.findById(parsed.data.targetServiceWindowId);
    if (!targetWindow || targetWindow.queueId !== turn.queueId) {
      throw AppError.notFound("Service window not found.", "SERVICE_WINDOW_NOT_FOUND");
    }

    const updated = await this.turnRepo.save({
      ...turn,
      status: "redirected",
      serviceWindowId: targetWindow.id,
    });

    this.emitter?.emitQueueUpdate(updated.queueId, {
      redirectedTurnId: updated.id,
      redirectedDisplayNumber: updated.displayNumber,
      targetServiceWindowId: targetWindow.id,
    });

    return {
      turnId: updated.id,
      status: "redirected",
      serviceWindowId: targetWindow.id,
    };
  }
}
