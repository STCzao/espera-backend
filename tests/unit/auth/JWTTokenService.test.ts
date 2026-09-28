import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { ACCESS_TOKEN_ALGORITHM, JWTTokenService } from "../../../src/modules/auth/infrastructure/JWTTokenService";
import { buildUser } from "../../helpers/authFakes";

const secret = process.env.JWT_ACCESS_SECRET as string;
const service = new JWTTokenService();

const decode = (token: string) => jwt.verify(token, secret) as jwt.JwtPayload;

describe("JWTTokenService.generateAccessToken", () => {
  it("identifies the user by subject and carries display fields only", () => {
    const user = buildUser({ id: "user-1", email: "owner@example.com", firstName: "Ana", lastName: "Pérez" });

    const payload = decode(service.generateAccessToken(user));

    expect(payload.sub).toBe("user-1");
    expect(payload).toMatchObject({ email: "owner@example.com", firstName: "Ana", lastName: "Pérez" });
  });

  it("does not carry role or approvalStatus: authenticate re-reads both per request", () => {
    // A token issued before a demotion, approval or block would otherwise keep
    // asserting the old values until it expired. GET /auth/me is the source of
    // truth for clients.
    const payload = decode(service.generateAccessToken(buildUser({ role: "business_admin", approvalStatus: "pending" })));

    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("approvalStatus");
  });

  it("signs with the pinned algorithm, never one a forged token could pick", () => {
    const { header } = jwt.decode(service.generateAccessToken(buildUser()), { complete: true }) as { header: jwt.JwtHeader };

    expect(header.alg).toBe(ACCESS_TOKEN_ALGORITHM);
    expect(ACCESS_TOKEN_ALGORITHM).toBe("HS256");
  });
});
