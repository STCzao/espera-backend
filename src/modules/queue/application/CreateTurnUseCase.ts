import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { BusinessAvailabilityService } from "@modules/business/domain/BusinessAvailabilityService";
import type { IBusinessHoursRepo } from "@modules/business/domain/IBusinessHoursRepo";
import type { IBusinessRepo } from "@modules/business/domain/IBusinessRepo";
import { PostgresBusinessHoursRepo } from "@modules/business/infrastructure/PostgresBusinessHoursRepo";
import { PostgresBusinessRepo } from "@modules/business/infrastructure/PostgresBusinessRepo";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z
  .object({
    queueId: z.string().uuid("Invalid queue id."),
    customerId: z.string().uuid().optional(),
    guestName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((data) => Boolean(data.customerId) || Boolean(data.guestName), {
    message: "Either customerId or guestName is required.",
  });

export type CreateTurnInput = z.infer<typeof schema>;

export interface CreateTurnOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
  position: number;
}

export const todayUTC = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

export class CreateTurnUseCase implements UseCase<CreateTurnInput, CreateTurnOutput> {
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly businessHoursRepo: IBusinessHoursRepo = new PostgresBusinessHoursRepo(),
    private readonly availabilityService: BusinessAvailabilityService = new BusinessAvailabilityService(),
  ) {}

  public async execute(input: CreateTurnInput): Promise<CreateTurnOutput> {
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

    const hoursConfig = await this.businessHoursRepo.findByBusinessId(business.id);
    if (!this.availabilityService.isWithinOperatingHours({ hoursConfig, now: new Date() })) {
      throw AppError.conflict(
        "This business is outside its operating hours.",
        "BUSINESS_OUTSIDE_OPERATING_HOURS",
      );
    }

    if (parsed.data.customerId) {
      const existing = await this.turnRepo.findActiveByCustomerInAnyBusiness(
        parsed.data.customerId,
      );
      if (existing) {
        throw AppError.conflict(
          "You already have an active turn at another business. Cancel it before taking a new one.",
          "CUSTOMER_HAS_ACTIVE_TURN",
        );
      }
    }

    const turn = await this.turnRepo.createWithNextNumber({
      queueId: parsed.data.queueId,
      businessId: queue.businessId,
      customerId: parsed.data.customerId,
      guestName: parsed.data.guestName,
      priority: "registered",
      source: parsed.data.customerId ? "app" : "web",
      turnDate: todayUTC(),
      prefix: queue.prefix,
      queueJoinedAt: new Date(),
    });

    return {
      turnId: turn.id,
      queueId: turn.queueId,
      displayNumber: turn.displayNumber,
      position: turn.number,
    };
  }
}
