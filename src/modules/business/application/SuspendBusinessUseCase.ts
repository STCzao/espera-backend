import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IRefreshSessionRepo } from "@modules/auth/public-api";
import { PostgresRefreshSessionRepo } from "@modules/auth/public-api";
import type { IQueueRepo, ITurnRepo } from "@modules/queue/public-api";
import { PostgresQueueRepo, PostgresTurnRepo, SocketIOEmitter } from "@modules/queue/public-api";
import type { Business } from "../domain/Business";
import type { IBusinessEmployeeRepo } from "../domain/IBusinessEmployeeRepo";
import type { IBusinessRepo } from "../domain/IBusinessRepo";
import { PostgresBusinessEmployeeRepo } from "../infrastructure/PostgresBusinessEmployeeRepo";
import { PostgresBusinessRepo } from "../infrastructure/PostgresBusinessRepo";

const schema = z.object({
  businessId:       z.string().uuid("Invalid business id."),
  suspendedByUserId: z.string().uuid("Invalid reviewer id."),
  reason:           z.string().trim().min(1, "Suspension reason is required.").max(500),
});

export type SuspendBusinessInput = z.infer<typeof schema>;

/**
 * Suspends an operating Business (HU-8.4): blocks it from operating,
 * invalidates the owner's and every active employee's sessions immediately,
 * and cancels every turn currently active across its queues.
 */
export class SuspendBusinessUseCase implements UseCase<SuspendBusinessInput, Business> {
  public constructor(
    private readonly businessRepo: IBusinessRepo = new PostgresBusinessRepo(),
    private readonly employeeRepo: IBusinessEmployeeRepo = new PostgresBusinessEmployeeRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
    private readonly queueRepo: IQueueRepo = new PostgresQueueRepo(),
    private readonly turnRepo: ITurnRepo = new PostgresTurnRepo(),
    private readonly emitter: SocketIOEmitter | null = null,
  ) {}

  public async execute(input: SuspendBusinessInput): Promise<Business> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const business = await this.businessRepo.findById(parsed.data.businessId);
    if (!business) throw AppError.notFound("Business not found.", "BUSINESS_NOT_FOUND");

    if (business.status !== "approved") {
      throw AppError.conflict("Only an approved business can be suspended.", "BUSINESS_CANNOT_BE_SUSPENDED");
    }

    const now = new Date();
    const updated = await this.businessRepo.save({
      ...business,
      status: "suspended",
      suspendedByUserId: parsed.data.suspendedByUserId,
      suspendedAt: now,
      suspensionReason: parsed.data.reason,
      updatedAt: now,
    });

    const employees = await this.employeeRepo.findByBusinessId(business.id);
    const activeUserIds = [
      business.ownerUserId,
      ...employees.filter((e) => e.status === "active").map((e) => e.userId),
    ];
    await Promise.all(activeUserIds.map((userId) => this.refreshSessionRepo.revokeAllByUserId(userId)));

    const queues = await this.queueRepo.findByBusinessId(business.id);
    for (const queue of queues) {
      const activeTurns = await this.turnRepo.findActiveByQueue(queue.id);
      for (const summary of activeTurns) {
        const turn = await this.turnRepo.findById(summary.turnId);
        if (!turn) continue;

        const cancelled = await this.turnRepo.save({ ...turn, status: "cancelled", cancelledAt: now });
        this.emitter?.emitQueueUpdate(queue.id, {
          cancelledTurnId: cancelled.id,
          cancelledDisplayNumber: cancelled.displayNumber,
        });
      }
    }

    return updated;
  }
}
