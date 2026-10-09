import { z } from "zod";

import { AppError } from "@shared/kernel/AppError";
import type { UseCase } from "@shared/kernel/UseCase";
import type { ApprovalStatus, UserRole } from "../domain/User";
import type { IUserRepo } from "../domain/IUserRepo";
import { PostgresUserRepo } from "../infrastructure/PostgresUserRepo";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const ROLES: readonly UserRole[] = ["user", "employee", "business_admin", "super_admin"];
const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "rejected"];

const schema = z.object({
  role:           z.enum(ROLES as [UserRole, ...UserRole[]]).optional(),
  isBlocked:      z.boolean().optional(),
  approvalStatus: z.enum(APPROVAL_STATUSES as [ApprovalStatus, ...ApprovalStatus[]]).optional(),
  search:         z.string().trim().min(1).optional(),
  sortBy:         z.enum(["name", "createdAt"]).default("createdAt"),
  sortDir:        z.enum(["asc", "desc"]).default("desc"),
  page:           z.number().int().min(1).default(1),
  pageSize:       z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// z.input (not z.infer/z.output) so callers can omit the fields that carry a
// .default() — same reasoning as ListAllBusinessesUseCase.
export type ListUsersInput = z.input<typeof schema>;

export interface UserListItem {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  isBlocked: boolean;
  createdAt: string;
}

export interface ListUsersOutput {
  items: UserListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Admin-facing user directory for the Backoffice "Usuarios" screen — did not
 * exist before: IUserRepo had no listing/search capability at all, only
 * lookups by exact id/email/token.
 *
 * Never returns passwordHash or any token field, same narrow-DTO reasoning
 * as BlockUserUseCase/UnblockUserUseCase.
 */
export class ListUsersUseCase implements UseCase<ListUsersInput, ListUsersOutput> {
  public constructor(
    private readonly userRepo: IUserRepo = new PostgresUserRepo(),
  ) {}

  public async execute(input: ListUsersInput): Promise<ListUsersOutput> {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0].message);

    const { role, isBlocked, approvalStatus, search, sortBy, sortDir, page, pageSize } = parsed.data;
    const baseFilters = { role, isBlocked, approvalStatus, search };

    const [users, total] = await Promise.all([
      this.userRepo.findMany({
        ...baseFilters, sortBy, sortDir, skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.userRepo.countMany(baseFilters),
    ]);

    const items = users.map((user) => ({
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
      isBlocked: user.isBlocked,
      createdAt: user.createdAt.toISOString(),
    }));

    return { items, page, pageSize, total };
  }
}
