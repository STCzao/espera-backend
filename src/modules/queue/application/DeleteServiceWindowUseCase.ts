import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  windowId: z.string().uuid("Invalid window id."),
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
  ) {}

  public async execute(input: DeleteServiceWindowInput): Promise<DeleteServiceWindowOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const window = await this.windowRepo.findById(parsed.data.windowId);
    if (!window) throw AppError.notFound("Service window not found.", "SERVICE_WINDOW_NOT_FOUND");

    const occupant = await this.turnRepo.findAttendingByServiceWindow(window.id);
    if (occupant) {
      throw AppError.conflict("Cannot delete a service window that is currently attending a turn.", "SERVICE_WINDOW_IN_USE");
    }

    await this.windowRepo.delete(window.id);

    return { deleted: true, windowId: window.id };
  }
}
