import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { todayUTC } from "@shared/utils/date";
import { EnsureBusinessMembershipUseCase } from "@modules/business/public-api";
import { QueueWaitEstimateService } from "../domain/QueueWaitEstimateService";
import type { TurnPriority, TurnSource } from "../domain/Turn";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
  requestingUserId: z.string().uuid("Invalid user id."),
});

export type GetQueueListInput = z.infer<typeof schema>;

export interface QueueListItem {
  turnId: string;
  displayNumber: string;
  customerName: string | null;
  guestName: string | null;
  phone: string | null;
  source: TurnSource;
  priority: TurnPriority;
  status: "waiting" | "called" | "attending" | "redirected";
  waitingMinutes: number;
  estimatedWaitMinutes: number | null;
  serviceWindowId: string | null;
  serviceWindowName: string | null;
}

export interface GetQueueListOutput {
  queueId: string;
  items: QueueListItem[];
}

const DEFAULT_SERVICE_MINUTES = 5;

const estimateService = new QueueWaitEstimateService();

export class GetQueueListUseCase implements UseCase<GetQueueListInput, GetQueueListOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly ensureBusinessMembershipUseCase: EnsureBusinessMembershipUseCase = new EnsureBusinessMembershipUseCase(),
  ) {}

  public async execute(input: GetQueueListInput): Promise<GetQueueListOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { queueId } = parsed.data;

    const queue = await this.queueRepo.findById(queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    await this.ensureBusinessMembershipUseCase.execute({
      businessId: queue.businessId,
      userId: parsed.data.requestingUserId,
    });

    const now = new Date();
    const today = todayUTC();

    const [summaries, avgMinutes, windows] = await Promise.all([
      this.turnRepo.findActiveByQueue(queueId),
      this.turnRepo.getAverageServiceMinutes(queueId, today),
      this.windowRepo.findByQueueId(queueId),
    ]);

    const windowNameById = new Map(windows.map((w) => [w.id, w.name]));
    const activeServiceWindows = windows.filter((w) => w.isActive).length;
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
          phone:                s.phone,
          source:               s.source,
          priority:             s.priority,
          status:               s.status,
          // Negative for a phone reservation with a declared ETA that
          // hasn't arrived yet (HU-4.5) — it hasn't "been waiting", it's
          // due to join in that many minutes. The panel should read a
          // negative value as "llega en X min", not as elapsed wait time.
          waitingMinutes:       Math.floor((now.getTime() - s.queueJoinedAt.getTime()) / 60_000),
          estimatedWaitMinutes,
          serviceWindowId:      s.serviceWindowId,
          serviceWindowName:    s.serviceWindowId ? (windowNameById.get(s.serviceWindowId) ?? null) : null,
        };
      }),
    };
  }
}
