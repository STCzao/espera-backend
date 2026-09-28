import { describe, expect, it } from "vitest";

import { parseTrustProxyValue } from "../../../src/shared/infrastructure/env";

describe("parseTrustProxyValue", () => {
  it("returns false when TRUST_PROXY is unset — no proxy trusted by default", () => {
    expect(parseTrustProxyValue(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(parseTrustProxyValue("")).toBe(false);
  });

  it("parses a numeric hop count as a number", () => {
    expect(parseTrustProxyValue("1")).toBe(1);
    expect(parseTrustProxyValue("2")).toBe(2);
  });

  it("passes through a non-numeric value (IP, CIDR, or keyword) as-is", () => {
    expect(parseTrustProxyValue("loopback")).toBe("loopback");
    expect(parseTrustProxyValue("10.0.0.1")).toBe("10.0.0.1");
  });
});
