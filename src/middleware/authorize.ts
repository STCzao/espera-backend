import type { NextFunction, Request, Response } from "express";

import { AppError } from "@shared/kernel/AppError";

type Permission =
  | "*"
  | "platform:approve_business_account"
  | "turn:create"
  | "turn:cancel"
  | "turn:read_own"
  | "queue:read"
  | "queue:call_next"
  | "queue:configure"
  | "employee:manage"
  | "business:edit";

const rolePermissions: Record<
  "user" | "employee" | "business_admin" | "super_admin",
  Permission[]
> = {
  user: ["turn:create", "turn:cancel", "turn:read_own"],
  employee: ["queue:read", "queue:call_next", "turn:create", "turn:cancel"],
  business_admin: ["queue:configure", "employee:manage", "business:edit"],
  super_admin: ["*", "platform:approve_business_account"]
};

export const authorize =
  (...requiredPermissions: Permission[]) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(AppError.unauthorized("Authentication is required."));
      return;
    }

    const grantedPermissions = rolePermissions[request.user.role] ?? [];
    const hasWildcardAccess = grantedPermissions.includes("*");
    const isAllowed = requiredPermissions.every((permission) =>
      hasWildcardAccess || grantedPermissions.includes(permission)
    );

    if (!isAllowed) {
      next(AppError.forbidden("You do not have permission to perform this action."));
      return;
    }

    next();
  };

export type { Permission };
