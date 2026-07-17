import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
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
  status: "waiting" | "called";
  // 0 = being called now; 1 = next in line; N = Nth in line
  position: number;
}

export class GetMyTurnUseCase implements UseCase<GetMyTurnInput, GetMyTurnOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
  ) {}

  public async execute(input: GetMyTurnInput): Promise<GetMyTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const turn = await this.turnRepo.findActiveByCustomerInQueue(
      parsed.data.customerId,
      parsed.data.queueId,
    );
    if (!turn) throw AppError.notFound("No active turn found in this queue.");

    if (turn.status === "called") {
      return {
        turnId: turn.id,
        queueId: turn.queueId,
        displayNumber: turn.displayNumber,
        status: "called",
        position: 0,
      };
    }

    const ahead = await this.turnRepo.countWaitingAhead(
      turn.queueId,
      turn.number,
      turn.turnDate,
    );

    return {
      turnId: turn.id,
      queueId: turn.queueId,
      displayNumber: turn.displayNumber,
      status: "waiting",
      position: ahead + 1,
    };
  }
}
