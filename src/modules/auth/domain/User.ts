export type UserRole = "user" | "employee" | "business_admin" | "super_admin";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  locality?: string;
  passwordHash?: string;
  role: UserRole;
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpiry?: Date;
  lastVerificationSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
