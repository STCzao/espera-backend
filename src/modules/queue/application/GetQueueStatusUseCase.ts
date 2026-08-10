import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import type { BusinessOperationalStatus } from "@modules/business/domain/Business";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import { QueueWaitEstimateService } from "../domain/QueueWaitEstimateService";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
});

export type GetQueueStatusInput = z.infer<typeof schema>;

export interface RecentCall {
  turnId: string;
  displayNumber: string;
  serviceWindowId: string | null;
  serviceWindowName: string | null;
  calledAt: string;
}

const RECENT_CALLS_LIMIT = 5;

export interface GetQueueStatusOutput {
  queueId: string;
  businessId: string;
  operationalStatus: BusinessOperationalStatus;
  activeServiceWindows: number;
  waitingCount: number;
  calledCount: number;
  attendingCount: number;
  redirectedCount: number;
  estimatedTotalWaitMinutes: number | null;
  recentCalls: RecentCall[];
}

const DEFAULT_SERVICE_MINUTES = 5;

const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const estimateService = new QueueWaitEstimateService();

export class GetQueueStatusUseCase implements UseCase<GetQueueStatusInput, GetQueueStatusOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: GetQueueStatusInput): Promise<GetQueueStatusOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    const today = todayUTC();
    const [activeTurns, business, avgMinutes, windows, recentCalls] = await Promise.all([
      this.turnRepo.findActiveByQueue(parsed.data.queueId),
      this.businessRepo.findById(queue.businessId),
      this.turnRepo.getAverageServiceMinutes(parsed.data.queueId, today),
      this.windowRepo.findByQueueId(parsed.data.queueId),
      this.turnRepo.findRecentCalls(parsed.data.queueId, RECENT_CALLS_LIMIT),
    ]);

    const waitingCount    = activeTurns.filter((t) => t.status === "waiting").length;
    const calledCount     = activeTurns.filter((t) => t.status === "called").length;
    const attendingCount  = activeTurns.filter((t) => t.status === "attending").length;
    const redirectedCount = activeTurns.filter((t) => t.status === "redirected").length;

    const activeServiceWindows = windows.filter((w) => w.isActive).length;
    const operationalStatus    = business?.operationalStatus ?? "normal";
    const serviceMinutes       = avgMinutes ?? DEFAULT_SERVICE_MINUTES;

    const estimate = estimateService.estimate({
      waitingTurns: waitingCount,
      activeServiceWindows,
      averageServiceMinutes: serviceMinutes,
    });

    return {
      queueId:                   queue.id,
      businessId:                queue.businessId,
      operationalStatus,
      activeServiceWindows,
      waitingCount,
      calledCount,
      attendingCount,
      redirectedCount,
      estimatedTotalWaitMinutes: estimate.attentionAvailable ? estimate.estimatedWaitMinutes : null,
      recentCalls: recentCalls.map((r) => ({
        turnId:            r.turnId,
        displayNumber:     r.displayNumber,
        serviceWindowId:   r.serviceWindowId,
        serviceWindowName: r.serviceWindowName,
        calledAt:          r.calledAt.toISOString(),
      })),
    };
  }
}
