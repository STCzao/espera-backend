import type { NextFunction, Request, Response } from "express";

import { AppError } from "@shared/kernel/AppError";

type Permission =
  | "*"
  | "auth:read_self"
  | "platform:approve_business_account"
  | "platform:manage_approvals"
  | "organization:edit"
  | "turn:create"
  | "turn:cancel"
  | "turn:cancel_any"
  | "turn:create_manual"
  | "turn:read_own"
  | "turn:update_own"
  | "turn:attend"
  | "turn:mark_no_show"
  | "queue:read"
  | "queue:call_next"
  | "queue:configure"
  | "employee:manage"
  | "business:edit";

const rolePermissions: Record<
  "user" | "employee" | "business_admin" | "super_admin",
  Permission[]
> = {
  user: ["auth:read_self", "turn:create", "turn:cancel", "turn:read_own", "turn:update_own"],
  employee: ["auth:read_self", "queue:read", "queue:call_next", "turn:create", "turn:cancel", "turn:cancel_any", "turn:create_manual", "turn:attend", "turn:mark_no_show"],
  business_admin: ["auth:read_self", "queue:read", "queue:call_next", "queue:configure", "employee:manage", "business:edit", "organization:edit", "turn:cancel_any", "turn:create_manual", "turn:attend", "turn:mark_no_show"],
  super_admin: ["*", "platform:approve_business_account", "platform:manage_approvals"]
};

/**
 * Coarse-grained role permission guard.
 *
 * Business ownership and employee membership are intentionally checked inside
 * use cases, because permissions alone cannot prove access to a specific
 * business instance.
 *
 * A business_admin whose account isn't approved yet is deliberately allowed
 * to log in (POST /business and GET /business/me bypass this middleware
 * entirely, and GET /auth/me only requires "auth:read_self") so they can see
 * their review status in the panel — but every other permission gated here
 * is a real business/queue/employee action, so it must wait for approval.
 */
export const authorize =
  (...requiredPermissions: Permission[]) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.user) {
      next(AppError.unauthorized("Authentication is required."));
      return;
    }

    const isSelfReadOnly = requiredPermissions.every((permission) => permission === "auth:read_self");

    if (
      !isSelfReadOnly &&
      request.user.role === "business_admin" &&
      request.user.approvalStatus !== "approved"
    ) {
      next(
        AppError.forbidden(
          "Your business account is pending approval.",
          "ACCOUNT_PENDING_APPROVAL",
        ),
      );
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
