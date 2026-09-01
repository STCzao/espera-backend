import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import { todayUTC } from "@shared/utils/date";
import type { IBusinessRepo } from "@modules/business/public-api";
import { EnsureBusinessMembershipUseCase, PostgresBusinessRepo } from "@modules/business/public-api";
import type { IQueueRepo } from "../domain/IQueueRepo";
import type { ITurnRepo } from "../domain/ITurnRepo";
import { PostgresQueueRepo } from "../infrastructure/PostgresQueueRepo";
import { PostgresTurnRepo } from "../infrastructure/PostgresTurnRepo";

const schema = z.object({
  queueId:   z.string().uuid("Invalid queue id."),
  requestingUserId: z.string().uuid("Invalid user id."),
  guestName: z.string().min(1, "Guest name is required.").max(100, "Guest name is too long."),
  phone:     z.string().trim().min(1).max(30).optional(),
  // "manual" = walk-in, staff enters it while the person is physically
  // there. "phone" = a reservation taken over a call/WhatsApp — the person
  // isn't present yet (HU-4.5 pilot). Defaults to "manual" so the existing
  // walk-in flow is unaffected.
  source:    z.enum(["manual", "phone"]).optional().default("manual"),
  // How many minutes from now the caller says they'll actually arrive —
  // asked once, in the same call, so a reservation taken well ahead of time
  // doesn't jump the line ahead of people who register live in between.
  // Irrelevant for "manual" (the person is already there).
  etaMinutes: z.number().int().min(0).max(24 * 60).optional(),
});

export type CreateManualTurnInput = z.input<typeof schema>;

export interface CreateManualTurnOutput {
  turnId: string;
  queueId: string;
  displayNumber: string;
  guestName: string;
  phone: string | null;
  source: "manual" | "phone";
  position: number;
}

export class CreateManualTurnUseCase
  implements UseCase<CreateManualTurnInput, CreateManualTurnOutput>
{
  public constructor(
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly ensureBusinessMembershipUseCase: EnsureBusinessMembershipUseCase = new EnsureBusinessMembershipUseCase(),
  ) {}

  public async execute(input: CreateManualTurnInput): Promise<CreateManualTurnOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const queue = await this.queueRepo.findById(parsed.data.queueId);
    if (!queue) throw AppError.notFound("Queue not found.", "QUEUE_NOT_FOUND");

    await this.ensureBusinessMembershipUseCase.execute({
      businessId: queue.businessId,
      userId: parsed.data.requestingUserId,
    });

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

    // A phone reservation is, for queue-ordering purposes, exactly like a
    // remote turn that hasn't confirmed anything yet — "registered", the
    // same priority CreateTurnUseCase assigns to app/QR/web turns. Only a
    // walk-in staff enters while the person is standing right there earns
    // "physical" and gets to skip ahead of people who registered remotely
    // but haven't shown up. Getting this wrong would let phone reservations
    // silently cut the line.
    const priority = parsed.data.source === "phone" ? "registered" : "physical";

    // Only a phone reservation can have a declared ETA — a walk-in is
    // already there, so it always joins the queue right now.
    const etaMinutes = parsed.data.source === "phone" ? (parsed.data.etaMinutes ?? 0) : 0;
    const now = new Date();
    const queueJoinedAt = new Date(now.getTime() + etaMinutes * 60_000);

    const turn = await this.turnRepo.createWithNextNumber({
      queueId:   parsed.data.queueId,
      businessId: queue.businessId,
      guestName: parsed.data.guestName,
      phone:     parsed.data.phone,
      priority,
      source:    parsed.data.source,
      turnDate:  todayUTC(),
      prefix:    queue.prefix,
      queueJoinedAt,
    });

    return {
      turnId:        turn.id,
      queueId:       turn.queueId,
      displayNumber: turn.displayNumber,
      guestName:     turn.guestName!,
      phone:         turn.phone ?? null,
      source:        turn.source as "manual" | "phone",
      position:      turn.number,
    };
  }
}
