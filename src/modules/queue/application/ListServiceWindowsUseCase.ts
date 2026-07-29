import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ServiceWindow } from "../domain/ServiceWindow";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
});

export type ListServiceWindowsInput = z.infer<typeof schema>;

export interface ServiceWindowWithCurrentTurn extends ServiceWindow {
  currentTurn: {
    turnId: string;
    displayNumber: string;
    startedAttentionAt: string;
  } | null;
}

export interface ListServiceWindowsOutput {
  windows: ServiceWindowWithCurrentTurn[];
}

export class ListServiceWindowsUseCase implements UseCase<ListServiceWindowsInput, ListServiceWindowsOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
  ) {}

  public async execute(input: ListServiceWindowsInput): Promise<ListServiceWindowsOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const [windows, activeTurns] = await Promise.all([
      this.windowRepo.findByQueueId(parsed.data.queueId),
      this.turnRepo.findActiveByQueue(parsed.data.queueId),
    ]);

    const attendingByWindowId = new Map(
      activeTurns
        .filter((t) => t.status === "attending" && t.serviceWindowId)
        .map((t) => [t.serviceWindowId as string, t]),
    );

    return {
      windows: windows.map((w) => {
        const turn = attendingByWindowId.get(w.id);
        return {
          ...w,
          currentTurn: turn
            ? {
                turnId: turn.turnId,
                displayNumber: turn.displayNumber,
                startedAttentionAt: turn.startedAttentionAt!.toISOString(),
              }
            : null,
        };
      }),
    };
  }
}
