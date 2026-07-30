import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";
import { todayUTC } from "./CreateTurnUseCase";

const schema = z.object({
  queueId:   z.string().uuid("Invalid queue id."),
  guestName: z.string().min(1, "Guest name is required.").max(100, "Guest name is too long."),
});

export type CreateManualTurnInput = z.infer<typeof schema>;

export interface CreateManualTurnOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
  guestName: string;
  position: number;
}

export class CreateManualTurnUseCase
  implements UseCase<CreateManualTurnInput, CreateManualTurnOutput>
{
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: CreateManualTurnInput): Promise<CreateManualTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");
    if (!queue.isActive) throw AppError.conflict("This queue is not accepting new turns.", "QUEUE_NOT_ACCEPTING_TURNS");

    const business = await this.businessRepo.findById(queue.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    if (business.status !== "approved") {
      throw AppError.conflict("This business is not currently accepting customers.", "BUSINESS_NOT_ACCEPTING_CUSTOMERS");
    }
    if (business.operationalStatus === "paused" || business.operationalStatus === "closed") {
      throw AppError.conflict(
        `This business is ${business.operationalStatus} and not accepting new turns.`,
        "BUSINESS_OPERATIONAL_STATUS_BLOCKED",
      );
    }

    const turn = await this.turnRepo.createWithNextNumber({
      queueId:   parsed.data.queueId,
      businessId: queue.businessId,
      guestName: parsed.data.guestName,
      priority:  "physical",
      source:    "manual",
      turnDate:  todayUTC(),
      prefix:    queue.prefix,
    });

    return {
      turnId:        turn.id,
      queueId:       turn.queueId,
      displayNumber: turn.displayNumber,
      guestName:     turn.guestName!,
      position:      turn.number,
    };
  }
}
