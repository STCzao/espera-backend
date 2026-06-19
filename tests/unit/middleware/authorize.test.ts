import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { authorize } from "../../../src/middleware/authorize";
import type { UserRole } from "../../../src/shared/types/express";

const buildRequest = (role?: UserRole): Request =>
  ({
    user: role
      ? {
          id: "user-1",
          email: "user@example.com",
          role,
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
});
