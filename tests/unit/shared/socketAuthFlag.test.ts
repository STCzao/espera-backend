import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * Guards the one parsing decision that would silently defeat the flag: the
 * rollout depends on SOCKET_REQUIRE_STAFF_AUTH defaulting to off, and
 * z.coerce.boolean() maps the *string* "false" to true, which would refuse
 * every unauthenticated staff panel the moment this shipped. Mirrors the
 * schema in env.ts, which can't be re-parsed per case at import time.
 */
const flag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

describe("SOCKET_REQUIRE_STAFF_AUTH", () => {
  it("is off when unset", () => {
    expect(flag.parse(undefined)).toBe(false);
  });

  it('reads the string "false" as off, which z.coerce.boolean() would get wrong', () => {
    expect(flag.parse("false")).toBe(false);
    expect(z.coerce.boolean().parse("false")).toBe(true);
  });

  it('is on only for the exact string "true"', () => {
    expect(flag.parse("true")).toBe(true);
    for (const invalid of ["TRUE", "1", "yes", ""]) {
      expect(() => flag.parse(invalid)).toThrow();
    }
  });
});
