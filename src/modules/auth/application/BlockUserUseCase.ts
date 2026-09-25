import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IUnitOfWork } from "@shared/kernel/UnitOfWork";
import { PrismaUnitOfWork } from "@shared/infrastructure/PrismaUnitOfWork";
import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const schema = z.object({
  userId:          z.string().uuid("Invalid user id."),
  blockedByUserId: z.string().uuid("Invalid reviewer id."),
  reason:          z.string().trim().min(1, "Block reason is required.").max(500),
});

export type BlockUserInput = z.infer<typeof schema>;

export interface BlockUserOutput {
  userId: string;
  isBlocked: true;
  blockedByUserId: string;
  blockedAt: Date;
  blockReason: string;
}

/**
 * Blocks a User account (used when suspending a reported user, HU-8.6):
 * prevents login and invalidates every active session immediately. Mirrors
 * SuspendBusinessUseCase's audit pattern, without a Business's queue/employee
 * cascade since a User account has none of that state.
 *
 * Returns a narrow DTO rather than the full User entity — same reason as
 * UnblockUserUseCase: User carries passwordHash and other tokens that must
 * never reach an HTTP response, even a future one that wires this use case
 * directly to a controller.
 */
export class BlockUserUseCase implements UseCase<BlockUserInput, BlockUserOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
    private readonly unitOfWork: IUnitOfWork = new PrismaUnitOfWork(),
  ) {}

  public async execute(input: BlockUserInput): Promise<BlockUserOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const user = await this.userRepo.findById(parsed.data.userId);
    if (!user) throw AppError.notFound("User not found.", "USER_NOT_FOUND");

    if (user.isBlocked) {
      throw AppError.conflict("User is already blocked.", "USER_ALREADY_BLOCKED");
    }

    const now = new Date();
    // The block flag and the session revocation commit together: if they
    // were separate, a failed revocation after the flag was saved would leave
    // the user blocked but with live sessions, and any retry would be turned
    // away by USER_ALREADY_BLOCKED (SuspendReportedUseCase treats that as
    // "already done"), so the sessions would never actually be cut off.
    const updated = await this.unitOfWork.run(async (tx) => {
      const saved = await this.userRepo.save({
        ...user,
        isBlocked: true,
        blockedByUserId: parsed.data.blockedByUserId,
        blockedAt: now,
        blockReason: parsed.data.reason,
        updatedAt: now,
      }, tx);

      await this.refreshSessionRepo.revokeAllByUserId(user.id, tx);

      return saved;
    });

    return {
      userId: updated.id,
      isBlocked: true,
      blockedByUserId: parsed.data.blockedByUserId,
      blockedAt: now,
      blockReason: parsed.data.reason,
    };
  }
}
