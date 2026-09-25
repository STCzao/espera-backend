import { describe, expect, it } from "vitest";

import { asQueryNumber, asQueryString } from "../../../src/shared/utils/queryParams";

describe("asQueryString", () => {
  it("returns the value when it's a string", () => {
    expect(asQueryString("hello")).toBe("hello");
  });

  it("returns undefined for undefined, arrays, and objects (repeated/nested query params)", () => {
    expect(asQueryString(undefined)).toBeUndefined();
    expect(asQueryString(["a", "b"])).toBeUndefined();
    expect(asQueryString({ nested: "a" })).toBeUndefined();
  });
});

describe("asQueryNumber", () => {
  it("parses a numeric string", () => {
    expect(asQueryNumber("42")).toBe(42);
  });

  it("returns undefined instead of NaN for a non-numeric string", () => {
    expect(asQueryNumber("not-a-number")).toBeUndefined();
  });

  it("returns undefined for an empty/blank string and for Infinity (Number() doesn't make those NaN)", () => {
    expect(asQueryNumber("")).toBeUndefined();
    expect(asQueryNumber("   ")).toBeUndefined();
    expect(asQueryNumber("Infinity")).toBeUndefined();
    expect(asQueryNumber("-Infinity")).toBeUndefined();
  });

  it("returns undefined for undefined or a non-string value", () => {
    expect(asQueryNumber(undefined)).toBeUndefined();
    expect(asQueryNumber(["1", "2"])).toBeUndefined();
  });
});
