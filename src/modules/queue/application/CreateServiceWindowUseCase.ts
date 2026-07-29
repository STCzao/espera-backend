import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ServiceWindow } from "../domain/ServiceWindow";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";

const schema = z.object({
  queueId: z.string().uuid("Invalid queue id."),
  name:    z.string().min(1, "Name is required.").max(100, "Name is too long."),
  type:    z.enum(["cashier", "customer_service", "information", "admin", "technical"]).optional().default("cashier"),
});

export type CreateServiceWindowInput = z.infer<typeof schema>;

export class CreateServiceWindowUseCase implements UseCase<CreateServiceWindowInput, ServiceWindow> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: CreateServiceWindowInput): Promise<ServiceWindow> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const now = new Date();
    const window: ServiceWindow = {
      id:        randomUUID(),
      queueId:   parsed.data.queueId,
      name:      parsed.data.name,
      type:      parsed.data.type,
      isActive:  true,
      createdAt: now,
      updatedAt: now,
    };

    return this.windowRepo.save(window);
  }
}
