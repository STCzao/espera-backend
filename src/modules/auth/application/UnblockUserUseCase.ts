import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const schema = z.object({
  userId:             z.string().uuid("Invalid user id."),
  unblockedByUserId:  z.string().uuid("Invalid reviewer id."),
});

export type UnblockUserInput = z.infer<typeof schema>;

export interface UnblockUserOutput {
  userId: string;
  isBlocked: false;
  unblockedByUserId: string;
  unblockedAt: Date;
}

/**
 * Reverses BlockUserUseCase (HU-8.6 only ever added the block, never a way
 * back). The account recovers access simply by logging in again — blocking
 * only revoked existing sessions, it never locked the account itself.
 *
 * Returns a narrow DTO rather than the full User entity — this use case is
 * wired directly to a controller, and User carries passwordHash and other
 * tokens that must never reach the response.
 */
export class UnblockUserUseCase implements UseCase<UnblockUserInput, UnblockUserOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: UnblockUserInput): Promise<UnblockUserOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const user = await this.userRepo.findById(parsed.data.userId);
    if (!user) throw AppError.notFound("User not found.", "USER_NOT_FOUND");

    if (!user.isBlocked) {
      throw AppError.conflict("User is not blocked.", "USER_NOT_BLOCKED");
    }

    const now = new Date();
    const updated = await this.userRepo.save({
      ...user,
      isBlocked: false,
      unblockedByUserId: parsed.data.unblockedByUserId,
      unblockedAt: now,
      updatedAt: now,
    });

    return {
      userId: updated.id,
      isBlocked: false,
      unblockedByUserId: parsed.data.unblockedByUserId,
      unblockedAt: now,
    };
  }
}
