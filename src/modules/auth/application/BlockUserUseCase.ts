import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IRefreshSessionRepo } from "../domain/IRefreshSessionRepo";
import type { IUserRepo } from "../domain/IUserRepo";
import type { User } from "../domain/User";
import { PostgresRefreshSessionRepo } from "../infrastructure/PostgresRefreshSessionRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const schema = z.object({
  userId:          z.string().uuid("Invalid user id."),
  blockedByUserId: z.string().uuid("Invalid reviewer id."),
  reason:          z.string().trim().min(1, "Block reason is required.").max(500),
});

export type BlockUserInput = z.infer<typeof schema>;

/**
 * Blocks a User account (used when suspending a reported user, HU-8.6):
 * prevents login and invalidates every active session immediately. Mirrors
 * SuspendBusinessUseCase's audit pattern, without a Business's queue/employee
 * cascade since a User account has none of that state.
 */
export class BlockUserUseCase implements UseCase<BlockUserInput, User> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
    private readonly refreshSessionRepo: IRefreshSessionRepo = new PostgresRefreshSessionRepo(),
  ) {}

  public async execute(input: BlockUserInput): Promise<User> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const user = await this.userRepo.findById(parsed.data.userId);
    if (!user) throw AppError.notFound("User not found.", "USER_NOT_FOUND");

    if (user.isBlocked) {
      throw AppError.conflict("User is already blocked.", "USER_ALREADY_BLOCKED");
    }

    const now = new Date();
    const updated = await this.userRepo.save({
      ...user,
      isBlocked: true,
      blockedByUserId: parsed.data.blockedByUserId,
      blockedAt: now,
      blockReason: parsed.data.reason,
      updatedAt: now,
    });

    await this.refreshSessionRepo.revokeAllByUserId(user.id);

    return updated;
  }
}
