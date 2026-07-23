import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo, TurnHistoryItem } from "../domain/ITurnRepo";
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

export type GetTurnHistoryInput = z.infer<typeof schema>;
export type GetTurnHistoryOutput = TurnHistoryItem[];

const parseToUTCDate = (dateStr?: string): Date => {
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export class GetTurnHistoryUseCase implements UseCase<GetTurnHistoryInput, GetTurnHistoryOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
  ) {}

  public async execute(input: GetTurnHistoryInput): Promise<GetTurnHistoryOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const date = parseToUTCDate(parsed.data.date);
    return this.turnRepo.findHistoryByQueue(parsed.data.queueId, date);
  }
}
