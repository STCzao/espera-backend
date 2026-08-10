import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { QueueWaitEstimateService } from "../domain/QueueWaitEstimateService";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
  customerId: z.string().uuid("Invalid customer id."),
});

export type GetMyTurnInput = z.infer<typeof schema>;

export interface GetMyTurnOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
  status: "waiting" | "called" | "attending" | "redirected";
  position: number;
  estimatedWaitMinutes: number | null;
  serviceWindowId: string | null;
}

const DEFAULT_SERVICE_MINUTES = 5;

const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const estimateService = new QueueWaitEstimateService();

export class GetMyTurnUseCase implements UseCase<GetMyTurnInput, GetMyTurnOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: GetMyTurnInput): Promise<GetMyTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    const turn = await this.turnRepo.findActiveByCustomerInQueue(
      parsed.data.customerId,
      parsed.data.queueId,
    );
    if (!turn) throw AppError.notFound("No active turn found in this queue.", "TURN_NOT_FOUND");

    if (turn.status === "called" || turn.status === "attending" || turn.status === "redirected") {
      return {
        turnId: turn.id,
        queueId: turn.queueId,
        displayNumber: turn.displayNumber,
        status: turn.status,
        position: 0,
        estimatedWaitMinutes: 0,
        serviceWindowId: turn.serviceWindowId ?? null,
      };
    }

    const today = todayUTC();
    const [ahead, windows, avgMinutes] = await Promise.all([
      this.turnRepo.countWaitingAhead(turn.queueId, turn.number, turn.priority),
      this.windowRepo.findByQueueId(turn.queueId),
      this.turnRepo.getAverageServiceMinutes(turn.queueId, today),
    ]);

    const activeServiceWindows = windows.filter((w) => w.isActive).length;
    const serviceMinutes = avgMinutes ?? DEFAULT_SERVICE_MINUTES;

    const estimate = estimateService.estimate({
      waitingTurns: ahead,
      activeServiceWindows,
      averageServiceMinutes: serviceMinutes,
    });

    return {
      turnId: turn.id,
      queueId: turn.queueId,
      displayNumber: turn.displayNumber,
      status: "waiting",
      position: ahead + 1,
      estimatedWaitMinutes: estimate.attentionAvailable ? estimate.estimatedWaitMinutes : null,
      serviceWindowId: null,
    };
  }
}
