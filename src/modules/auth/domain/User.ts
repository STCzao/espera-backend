export type UserRole = "user" | "employee" | "business_admin" | "super_admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type AuthProvider = "local" | "google";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  locality?: string;
  passwordHash?: string;
  refreshTokenHash?: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  authProvider: AuthProvider;
  googleId?: string;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  lastVerificationSentAt?: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  passwordResetUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
