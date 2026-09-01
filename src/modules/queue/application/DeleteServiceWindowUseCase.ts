import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  windowId:    z.string().uuid("Invalid window id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type DeleteServiceWindowInput = z.infer<typeof schema>;

export interface DeleteServiceWindowOutput {
  deleted: boolean;
  windowId: string;
}

export class DeleteServiceWindowUseCase implements UseCase<DeleteServiceWindowInput, DeleteServiceWindowOutput> {
  public constructor(
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: DeleteServiceWindowInput): Promise<DeleteServiceWindowOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const window = await this.windowRepo.findById(parsed.data.windowId);
    if (!window) throw AppError.notFound("Service window not found.", "SERVICE_WINDOW_NOT_FOUND");

    const queue = await this.queueRepo.findById(window.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    const business = await this.businessRepo.findById(queue.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to configure this queue.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    const occupant = await this.turnRepo.findAttendingByServiceWindow(window.id);
    if (occupant) {
      throw AppError.conflict("Cannot delete a service window that is currently attending a turn.", "SERVICE_WINDOW_IN_USE");
    }

    await this.windowRepo.delete(window.id);

    return { deleted: true, windowId: window.id };
  }
}
