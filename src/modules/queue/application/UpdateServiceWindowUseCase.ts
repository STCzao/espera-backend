import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ServiceWindow } from "../domain/ServiceWindow";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";

const schema = z.object({
  windowId: z.string().uuid("Invalid window id."),
  name:     z.string().min(1, "Name is required.").max(100, "Name is too long.").optional(),
  type:     z.enum(["cashier", "customer_service", "information", "admin", "technical"]).optional(),
});

export type UpdateServiceWindowInput = z.infer<typeof schema>;

export class UpdateServiceWindowUseCase implements UseCase<UpdateServiceWindowInput, ServiceWindow> {
  public constructor(
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
  ) {}

  public async execute(input: UpdateServiceWindowInput): Promise<ServiceWindow> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const window = await this.windowRepo.findById(parsed.data.windowId);
    if (!window) throw AppError.notFound("Service window not found.", "SERVICE_WINDOW_NOT_FOUND");

    return this.windowRepo.save({
      ...window,
      name:      parsed.data.name ?? window.name,
      type:      parsed.data.type ?? window.type,
      updatedAt: new Date(),
    });
  }
}
