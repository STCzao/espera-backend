import { PostgresUserRepo } from "@modules/auth/public-api";

export interface AuthenticatedUserSnapshot {
  id: string;
  email: string;
  role: "user" | "employee" | "business_admin" | "super_admin";
  approvalStatus: "pending" | "approved" | "rejected";
  isBlocked: boolean;
}

const userRepo = new PostgresUserRepo();

/**
 * Current, authoritative state of the user a valid access token names.
 * Kept behind its own function so `authenticate` stays testable without a
 * database (API tests mock this module).
 */
export const loadAuthenticatedUser = async (userId: string): Promise<AuthenticatedUserSnapshot | null> => {
  const user = await userRepo.findById(userId);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    approvalStatus: user.approvalStatus,
    isBlocked: user.isBlocked,
  };
};
