import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { TurnPriority } from "../domain/Turn";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
});

export type GetQueueListInput = z.infer<typeof schema>;

export interface QueueListItem {
  turnId: string;
  displayNumber: string;
  customerName: string | null;
  guestName: string | null;
  priority: TurnPriority;
  status: "waiting" | "called";
  waitingMinutes: number;
}

export interface GetQueueListOutput {
  queueId: string;
  items: QueueListItem[];
}

export class GetQueueListUseCase implements UseCase<GetQueueListInput, GetQueueListOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
  ) {}

  public async execute(input: GetQueueListInput): Promise<GetQueueListOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { queueId } = parsed.data;

    const queue = await this.queueRepo.findById(queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const now = new Date();
    const summaries = await this.turnRepo.findActiveByQueue(queueId);

    return {
      queueId,
      items: summaries.map((s) => ({
        turnId:         s.turnId,
        displayNumber:  s.displayNumber,
        customerName:   s.customerName,
        guestName:      s.guestName,
        priority:       s.priority,
        status:         s.status,
        waitingMinutes: Math.floor((now.getTime() - s.createdAt.getTime()) / 60_000),
      })),
    };
  }
}
