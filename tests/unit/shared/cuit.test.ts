import { describe, expect, it } from "vitest";

import { isValidCuit } from "../../../src/shared/utils/cuit";

describe("isValidCuit", () => {
  it("accepts a CUIT with a correct check digit", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
  });

  it("accepts the same CUIT without dashes", () => {
    expect(isValidCuit("20123456786")).toBe(true);
  });

  it("rejects a CUIT with a wrong check digit", () => {
    expect(isValidCuit("20-12345678-7")).toBe(false);
  });

  it("rejects a value that isn't 11 digits", () => {
    expect(isValidCuit("123")).toBe(false);
  });

  it("rejects a value whose check digit would have to be 10 (not a valid CUIT digit)", () => {
    expect(isValidCuit("00000000069")).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(isValidCuit("razon social sa")).toBe(false);
  });
});
