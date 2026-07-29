import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import { QueueWaitEstimateService } from "../domain/QueueWaitEstimateService";
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
  status: "waiting" | "called" | "attending";
  waitingMinutes: number;
  estimatedWaitMinutes: number | null;
}

export interface GetQueueListOutput {
  queueId: string;
  items: QueueListItem[];
}

const DEFAULT_SERVICE_MINUTES = 5;

const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const estimateService = new QueueWaitEstimateService();

export class GetQueueListUseCase implements UseCase<GetQueueListInput, GetQueueListOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: GetQueueListInput): Promise<GetQueueListOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { queueId } = parsed.data;

    const queue = await this.queueRepo.findById(queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const now = new Date();
    const today = todayUTC();

    const [summaries, business, avgMinutes] = await Promise.all([
      this.turnRepo.findActiveByQueue(queueId),
      this.businessRepo.findById(queue.businessId),
      this.turnRepo.getAverageServiceMinutes(queueId, today),
    ]);

    const activeServiceWindows = business?.activeServiceWindows ?? 1;
    const serviceMinutes = avgMinutes ?? DEFAULT_SERVICE_MINUTES;

    let waitingPosition = 0;

    return {
      queueId,
      items: summaries.map((s) => {
        let estimatedWaitMinutes: number | null = null;

        if (s.status === "waiting") {
          waitingPosition++;
          const estimate = estimateService.estimate({
            waitingTurns: waitingPosition,
            activeServiceWindows,
            averageServiceMinutes: serviceMinutes,
          });
          estimatedWaitMinutes = estimate.attentionAvailable ? estimate.estimatedWaitMinutes : null;
        }

        return {
          turnId:               s.turnId,
          displayNumber:        s.displayNumber,
          customerName:         s.customerName,
          guestName:            s.guestName,
          priority:             s.priority,
          status:               s.status,
          waitingMinutes:       Math.floor((now.getTime() - s.createdAt.getTime()) / 60_000),
          estimatedWaitMinutes,
        };
      }),
    };
  }
}
