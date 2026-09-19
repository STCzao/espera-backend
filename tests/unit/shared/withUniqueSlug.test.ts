import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { withUniqueSlug } from "../../../src/shared/infrastructure/withUniqueSlug";

const p2002 = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.3",
    meta: { target },
  });

describe("withUniqueSlug", () => {
  it("saves on the first attempt when there's no conflict", async () => {
    const findBySlug = vi.fn().mockResolvedValue(null);
    const trySave = vi.fn().mockResolvedValue({ id: "1", slug: "cafe-espera" });

    const result = await withUniqueSlug("Cafe Espera", findBySlug, trySave);

    expect(result).toEqual({ id: "1", slug: "cafe-espera" });
    expect(trySave).toHaveBeenCalledTimes(1);
    expect(trySave).toHaveBeenCalledWith("cafe-espera");
  });

  it("regenerates the slug and retries when trySave hits a P2002 on slug (concurrent signup)", async () => {
    const findBySlug = vi
      .fn()
      .mockResolvedValueOnce(null) // attempt 1's check: base free
      .mockResolvedValueOnce({}) // attempt 2's check: base now taken — the racing insert landed
      .mockResolvedValueOnce(null); // attempt 2's check for "-2": free
    const trySave = vi
      .fn()
      .mockRejectedValueOnce(p2002(["slug"]))
      .mockResolvedValueOnce({ id: "2", slug: "cafe-espera-2" });

    const result = await withUniqueSlug("Cafe Espera", findBySlug, trySave);

    expect(result).toEqual({ id: "2", slug: "cafe-espera-2" });
    expect(trySave).toHaveBeenNthCalledWith(1, "cafe-espera");
    expect(trySave).toHaveBeenNthCalledWith(2, "cafe-espera-2");
  });

  it("propagates the error after exhausting every retry attempt", async () => {
    const findBySlug = vi.fn().mockResolvedValue(null);
    const conflict = p2002(["slug"]);
    const trySave = vi.fn().mockRejectedValue(conflict);

    await expect(withUniqueSlug("Cafe Espera", findBySlug, trySave, 3)).rejects.toBe(conflict);
    expect(trySave).toHaveBeenCalledTimes(3);
  });

  it("does not retry a P2002 on an unrelated unique field", async () => {
    const findBySlug = vi.fn().mockResolvedValue(null);
    const conflict = p2002(["email"]);
    const trySave = vi.fn().mockRejectedValue(conflict);

    await expect(withUniqueSlug("Cafe Espera", findBySlug, trySave)).rejects.toBe(conflict);
    expect(trySave).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unrelated error", async () => {
    const findBySlug = vi.fn().mockResolvedValue(null);
    const boom = new Error("boom");
    const trySave = vi.fn().mockRejectedValue(boom);

    await expect(withUniqueSlug("Cafe Espera", findBySlug, trySave)).rejects.toBe(boom);
    expect(trySave).toHaveBeenCalledTimes(1);
  });
});
