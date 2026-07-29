import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ServiceWindow } from "../domain/ServiceWindow";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";

const schema = z.object({
  windowId: z.string().uuid("Invalid window id."),
});

export type ToggleServiceWindowInput = z.infer<typeof schema>;

export class ToggleServiceWindowUseCase implements UseCase<ToggleServiceWindowInput, ServiceWindow> {
  public constructor(
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: ToggleServiceWindowInput): Promise<ServiceWindow> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const window = await this.windowRepo.findById(parsed.data.windowId);
    if (!window) throw AppError.notFound("Service window not found.");

    return this.windowRepo.save({ ...window, isActive: !window.isActive, updatedAt: new Date() });
  }
}
