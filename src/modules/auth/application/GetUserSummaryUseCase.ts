import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ApprovalStatus, UserRole } from "../domain/User";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const schema = z.object({
  userId: z.string().uuid("Invalid user id."),
});

export type GetUserSummaryInput = z.infer<typeof schema>;

export interface GetUserSummaryOutput {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  isBlocked: boolean;
  createdAt: string;
}

/**
 * Resolves a single user into a narrow, admin-safe summary — never
 * passwordHash or any token field, same reasoning as ListUsersUseCase.
 *
 * Meant to be reused *inside* other use cases that need to show "who" next
 * to something they already resolved (a business's owner, an organization's
 * admin, who a report targets), the same way GetBusinessReviewDetailUseCase
 * already embeds its Organization instead of making the frontend fetch it
 * separately. Also wired to its own GET /auth/users/:userId for the
 * Usuarios directory's own detail view.
 */
export class GetUserSummaryUseCase implements UseCase<GetUserSummaryInput, GetUserSummaryOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: GetUserSummaryInput): Promise<GetUserSummaryOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const user = await this.userRepo.findById(parsed.data.userId);
    if (!user) throw AppError.notFound("User not found.", "USER_NOT_FOUND");

    return {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
      isBlocked: user.isBlocked,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
