import "express-serve-static-core";

export type UserRole = "user" | "employee" | "business_admin" | "super_admin";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: UserRole;
      businessId?: string;
    };
    refreshToken?: string;
  }
}
