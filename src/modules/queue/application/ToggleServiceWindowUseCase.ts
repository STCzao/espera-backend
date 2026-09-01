import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IBusinessRepo } from "@modules/business/public-api";
import { PostgresBusinessRepo } from "@modules/business/public-api";
import { EnsureServiceWindowCreationAllowedUseCase } from "@modules/organization/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { IServiceWindowRepo } from "../domain/IServiceWindowRepo";
import type { ServiceWindow } from "../domain/ServiceWindow";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresServiceWindowRepo } from "../infrastructure/PostgresServiceWindowRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  windowId:    z.string().uuid("Invalid window id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
});

export type ToggleServiceWindowInput = z.infer<typeof schema>;

export class ToggleServiceWindowUseCase implements UseCase<ToggleServiceWindowInput, ServiceWindow> {
  public constructor(
    private readonly windowRepo: IServiceWindowRepo = new PostgresServiceWindowRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly ensureServiceWindowCreationAllowedUseCase: EnsureServiceWindowCreationAllowedUseCase = new EnsureServiceWindowCreationAllowedUseCase(),
  ) {}

  public async execute(input: ToggleServiceWindowInput): Promise<ServiceWindow> {
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

    if (window.isActive) {
      const occupant = await this.turnRepo.findAttendingByServiceWindow(window.id);
      if (occupant) {
        throw AppError.conflict("Cannot deactivate a service window that is currently attending a turn.", "SERVICE_WINDOW_IN_USE");
      }
    } else {
      // Reactivating is a second door into the same slot
      // CreateServiceWindowUseCase guards — a window deactivated by
      // EnforceQueueLimitsForOrganizationUseCase (plan downgrade) must not
      // come back for free.
      const siblings = await this.windowRepo.findByQueueId(queue.id);
      const activeWindowCount = siblings.filter((w) => w.id !== window.id && w.isActive).length;
      await this.ensureServiceWindowCreationAllowedUseCase.execute({
        organizationId: business.organizationId,
        currentServiceWindowCountForQueue: activeWindowCount,
      });
    }

    return this.windowRepo.save({ ...window, isActive: !window.isActive, updatedAt: new Date() });
  }
}
