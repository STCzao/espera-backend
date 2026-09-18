import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { authorize } from "../../../src/middleware/authorize";
import type { UserRole } from "../../../src/shared/types/express";

const buildRequest = (
  role?: UserRole,
  approvalStatus: "pending" | "approved" | "rejected" = "approved",
): Request =>
  ({
    user: role
      ? {
          id: "user-1",
          email: "user@example.com",
          role,
          approvalStatus,
        }
      : undefined,
  }) as Request;

const buildNext = () => vi.fn() as unknown as NextFunction;

describe("authorize", () => {
  it("allows business admins to read their own auth profile", () => {
    const next = buildNext();

    authorize("auth:read_self")(buildRequest("business_admin"), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects authenticated users without the required permission", () => {
    const next = buildNext();

    authorize("queue:configure")(buildRequest("user"), {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
      }),
    );
  });

  it("requires authentication", () => {
    const next = buildNext();

    authorize("auth:read_self")(buildRequest(), {} as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
      }),
    );
  });

  it("blocks a pending business admin from a privileged action (HU-1.x approval gate)", () => {
    const next = buildNext();

    authorize("business:edit")(
      buildRequest("business_admin", "pending"),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: "ACCOUNT_PENDING_APPROVAL",
      }),
    );
  });

  it("blocks a rejected business admin from a privileged action", () => {
    const next = buildNext();

    authorize("employee:manage")(
      buildRequest("business_admin", "rejected"),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: "ACCOUNT_PENDING_APPROVAL",
      }),
    );
  });

  it("allows an approved business admin to perform privileged actions", () => {
    const next = buildNext();

    authorize("business:edit")(
      buildRequest("business_admin", "approved"),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });
});
