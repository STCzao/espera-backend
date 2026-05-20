export type UserRole = "user" | "employee" | "business_admin" | "super_admin";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  businessId?: string;
  createdAt: Date;
  updatedAt: Date;
}
