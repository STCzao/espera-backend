import { z } from "zod";

import { domainEventBus, type EventBus } from "@shared/EventBus";
import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type {
  Business,
  BusinessOperationalStatus,
} from "../domain/Business";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const updateBusinessOperationalStatusSchema = z.object({
  businessId: z.string().uuid("Invalid business id."),
  ownerUserId: z.string().uuid("Invalid owner user id."),
  operationalStatus: z.enum(["normal", "delayed", "paused", "closed"], {
    required_error: "Operational status is required.",
    invalid_type_error: "Invalid operational status.",
  }),
  reason: z.string().trim().max(200).optional(),
});

export type UpdateBusinessOperationalStatusInput = z.infer<
  typeof updateBusinessOperationalStatusSchema
>;

export interface UpdateBusinessOperationalStatusOutput {
  businessId: string;
  operationalStatus: BusinessOperationalStatus;
  acceptsNewTurns: boolean;
  indicator: "none" | "yellow" | "red" | "gray";
  customerMessage: string;
}

const statusPresentation: Record<
  BusinessOperationalStatus,
  Omit<UpdateBusinessOperationalStatusOutput, "businessId" | "operationalStatus">
> = {
  normal: {
    acceptsNewTurns: true,
    indicator: "none",
    customerMessage: "Atencion disponible.",
  },
  delayed: {
    acceptsNewTurns: true,
    indicator: "yellow",
    customerMessage: "Con demoras.",
  },
  paused: {
    acceptsNewTurns: false,
    indicator: "gray",
    customerMessage: "Atencion pausada temporalmente.",
  },
  closed: {
    acceptsNewTurns: false,
    indicator: "red",
    customerMessage: "Atencion cerrada.",
  },
};

/**
 * Updates the manual operational switch exposed in the business panel.
 *
 * This status is separate from schedules: a business can be inside opening
 * hours and still pause or close turn intake for operational reasons.
 */
export class UpdateBusinessOperationalStatusUseCase
  implements
    UseCase<
      UpdateBusinessOperationalStatusInput,
      UpdateBusinessOperationalStatusOutput
    >
{
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly eventBus: EventBus = domainEventBus,
  ) {}

  public async execute(
    input: UpdateBusinessOperationalStatusInput,
  ): Promise<UpdateBusinessOperationalStatusOutput> {
    const parsed = updateBusinessOperationalStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.errors[0].message);
    }

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) {
      throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");
    }

    if (business.ownerUserId !== parsed.data.ownerUserId) {
      throw AppError.forbidden(
        "You do not have permission to edit this business.",
        "BUSINESS_OWNERSHIP_REQUIRED",
      );
    }

    if (business.status !== "approved") {
      throw AppError.conflict(
        "This business is not currently operating.",
        "BUSINESS_NOT_OPERATING",
      );
    }

    const previousStatus = business.operationalStatus;
    const updatedBusiness = await this.businessRepo.save({
      ...business,
      operationalStatus: parsed.data.operationalStatus,
      updatedAt: new Date(),
    });

    // Closing is an edge-triggered event: integrations should react only when
    // the business transitions into closed, not on repeated closed saves.
    if (previousStatus !== "closed" && updatedBusiness.operationalStatus === "closed") {
      this.eventBus.emit("business.closed", {
        businessId: updatedBusiness.id,
        ownerUserId: updatedBusiness.ownerUserId,
        previousStatus,
        reason: parsed.data.reason,
        occurredAt: new Date(),
      });
    }

    return this.toOutput(updatedBusiness);
  }

  private toOutput(business: Business): UpdateBusinessOperationalStatusOutput {
    const presentation = statusPresentation[business.operationalStatus];

    return {
      businessId: business.id,
      operationalStatus: business.operationalStatus,
      ...presentation,
    };
  }
}
