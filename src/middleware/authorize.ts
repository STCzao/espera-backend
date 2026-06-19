import type { NextFunction, Request, Response } from "express";

import { AppError } from "@shared/kernel/AppError";

type Permission =
  | "*"
  | "auth:read_self"
  | "platform:approve_business"
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
  user: ["auth:read_self", "turn:create", "turn:cancel", "turn:read_own"],
  employee: ["auth:read_self", "queue:read", "queue:call_next", "turn:create", "turn:cancel"],
  business_admin: ["auth:read_self", "queue:configure", "employee:manage", "business:edit"],
  super_admin: ["*", "platform:approve_business"]
};

/**
 * Coarse-grained role permission guard.
 *
 * Business ownership and employee membership are intentionally checked inside
 * use cases, because permissions alone cannot prove access to a specific
 * business instance.
 */
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
