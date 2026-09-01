import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ServiceWindow } from "../domain/ServiceWindow";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";

const schema = z.object({
  windowId:    z.string().uuid("Invalid window id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  name:        z.string().min(1, "Name is required.").max(100, "Name is too long.").optional(),
  type:        z.enum(["cashier", "customer_service", "information", "admin", "technical"]).optional(),
});

export type UpdateServiceWindowInput = z.infer<typeof schema>;

export class UpdateServiceWindowUseCase implements UseCase<UpdateServiceWindowInput, ServiceWindow> {
  public constructor(
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
  ) {}

  public async execute(input: UpdateServiceWindowInput): Promise<ServiceWindow> {
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

    return this.windowRepo.save({
      ...window,
      name:      parsed.data.name ?? window.name,
      type:      parsed.data.type ?? window.type,
      updatedAt: new Date(),
    });
  }
}
