import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { TurnDayRaw } from "../domain/ITurnRepo";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
  date: z
    .string()
    .regex(DATE_REGEX, "Date must be in YYYY-MM-DD format.")
    .optional(),
});

export type GetQueueMetricsInput = z.infer<typeof schema>;

export interface DayMetrics {
  completedCount: number;
  cancelledCount: number;
  totalCount: number;
  cancellationRate: number;
  avgServiceMinutes: number | null;
  peakHour: number | null;
}

export interface GetQueueMetricsOutput {
  date: string;
  today: DayMetrics;
  yesterday: DayMetrics;
}

const parseToUTCDate = (dateStr?: string): Date => {
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const toDateStr = (date: Date): string =>
  date.toISOString().slice(0, 10);

const subtractDay = (date: Date): Date =>
  new Date(date.getTime() - 24 * 60 * 60 * 1000);

const computeMetrics = (raw: TurnDayRaw): DayMetrics => {
  const completedCount = raw.completedTurns.length;
  const { cancelledCount } = raw;
  const totalCount = completedCount + cancelledCount;

  const cancellationRate =
    totalCount > 0 ? Math.round((cancelledCount / totalCount) * 1000) / 10 : 0;

  const avgServiceMinutes =
    completedCount > 0
      ? Math.round(
          raw.completedTurns.reduce(
            (sum, t) => sum + (t.attendedAt.getTime() - t.startedAttentionAt.getTime()) / 60_000,
            0,
          ) / completedCount,
        )
      : null;

  let peakHour: number | null = null;
  if (completedCount > 0) {
    const countByHour = new Map<number, number>();
    for (const t of raw.completedTurns) {
      const hour = t.startedAttentionAt.getUTCHours();
      countByHour.set(hour, (countByHour.get(hour) ?? 0) + 1);
    }
    peakHour = [...countByHour.entries()].reduce((max, cur) =>
      cur[1] > max[1] ? cur : max,
    )[0];
  }

  return { completedCount, cancelledCount, totalCount, cancellationRate, avgServiceMinutes, peakHour };
};

export class GetQueueMetricsUseCase implements UseCase<GetQueueMetricsInput, GetQueueMetricsOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
  ) {}

  public async execute(input: GetQueueMetricsInput): Promise<GetQueueMetricsOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    const date      = parseToUTCDate(parsed.data.date);
    const yesterday = subtractDay(date);

    const [todayRaw, yesterdayRaw] = await Promise.all([
      this.turnRepo.getRawMetricsByDate(parsed.data.queueId, date),
      this.turnRepo.getRawMetricsByDate(parsed.data.queueId, yesterday),
    ]);

    return {
      date:      toDateStr(date),
      today:     computeMetrics(todayRaw),
      yesterday: computeMetrics(yesterdayRaw),
    };
  }
}
