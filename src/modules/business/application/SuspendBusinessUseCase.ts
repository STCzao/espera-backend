import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IUnitOfWork } from "@shared/kernel/UnitOfWork";
import { PrismaUnitOfWork } from "@shared/infrastructure/PrismaUnitOfWork";
import type { IRefreshSessionRepo } from "@modules/auth/public-api";
import { PostgresRefreshSessionRepo } from "@modules/auth/public-api";
import type { IQueueRepo, ITurnRepo, Turn } from "@modules/queue/public-api";
import { PostgresQueueRepo, PostgresTurnRepo, saveTurnOrThrowConflict, SocketIOEmitter } from "@modules/queue/public-api";
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
    private readonly unitOfWork: IUnitOfWork = new PrismaUnitOfWork(),
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

    const employees = await this.employeeRepo.findByBusinessId(business.id);
    const activeUserIds = [
      business.ownerUserId,
      ...employees.filter((e) => e.status === "active").map((e) => e.userId),
    ];

    // Reads happen up front — what to cancel doesn't need to be inside the
    // transaction, only the writes below do. Each cancel still goes through
    // saveTurnOrThrowConflict's optimistic-concurrency guard, so a turn that
    // changed between this read and the write below is caught there, same
    // as everywhere else that pattern is used.
    const queues = await this.queueRepo.findByBusinessId(business.id);
    const turnsToCancel: Array<{ queueId: string; turn: Turn }> = [];
    for (const queue of queues) {
      const activeTurns = await this.turnRepo.findActiveByQueue(queue.id);
      for (const summary of activeTurns) {
        const turn = await this.turnRepo.findById(summary.turnId);
        if (turn) turnsToCancel.push({ queueId: queue.id, turn });
      }
    }

    // The status flip, every session revocation and every turn cancellation
    // commit together or not at all — a partial failure used to leave the
    // business marked "suspended" while some sessions/turns it's supposed
    // to have cut off stayed live.
    const updated = await this.unitOfWork.run(async (tx) => {
      const updatedBusiness = await this.businessRepo.save({
        ...business,
        status: "suspended",
        suspendedByUserId: parsed.data.suspendedByUserId,
        suspendedAt: now,
        suspensionReason: parsed.data.reason,
        updatedAt: now,
      }, tx);

      await Promise.all(
        activeUserIds.map((userId) => this.refreshSessionRepo.revokeAllByUserId(userId, tx)),
      );

      for (const { turn } of turnsToCancel) {
        await saveTurnOrThrowConflict(this.turnRepo, { ...turn, status: "cancelled", cancelledAt: now }, tx);
      }

      return updatedBusiness;
    });

    // Broadcast only after the transaction actually commits — emitting
    // before that would tell clients about a cancellation that could still
    // be rolled back.
    for (const { queueId, turn } of turnsToCancel) {
      this.emitter?.emitQueueUpdate(queueId, {
        cancelledTurnId: turn.id,
        cancelledDisplayNumber: turn.displayNumber,
      });
    }

    return updated;
  }
}
