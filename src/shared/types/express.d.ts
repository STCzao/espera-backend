import "express-serve-static-core";

export type UserRole = "user" | "employee" | "business_admin" | "super_admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      email: string;
      role: UserRole;
      approvalStatus: ApprovalStatus;
    };
    refreshToken?: string;
  }
}
