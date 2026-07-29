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
});

export type ListServiceWindowsInput = z.infer<typeof schema>;

export interface ListServiceWindowsOutput {
  windows: ServiceWindow[];
}

export class ListServiceWindowsUseCase implements UseCase<ListServiceWindowsInput, ListServiceWindowsOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: ListServiceWindowsInput): Promise<ListServiceWindowsOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.");

    const windows = await this.windowRepo.findByQueueId(parsed.data.queueId);
    return { windows };
  }
}
