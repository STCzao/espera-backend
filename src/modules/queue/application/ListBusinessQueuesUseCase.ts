import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { Queue } from "../domain/Queue";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";

const schema = z.object({
  businessId:  z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ListBusinessQueuesInput = z.infer<typeof schema>;

/**
 * Lists every Queue for a Business — was only reachable internally
 * (IQueueRepo.findByBusinessId) before this; there was no way for a panel
 * to see how many queues a Business already has before deciding whether to
 * create another one.
 */
export class ListBusinessQueuesUseCase implements UseCase<ListBusinessQueuesInput, Queue[]> {
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
  ) {}

  public async execute(input: ListBusinessQueuesInput): Promise<Queue[]> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to view this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    return this.queueRepo.findByBusinessId(business.id);
  }
}
