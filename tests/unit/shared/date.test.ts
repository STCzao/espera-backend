import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { todayUTC } from "../../../src/shared/utils/date";

describe("todayUTC", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's UTC midnight for a moment safely inside Argentina's daytime", () => {
    // 15:00 Argentina (UTC-3) = 18:00 UTC, same calendar day either way.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T18:00:00.000Z"));

    expect(todayUTC().toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("stays on Argentina's calendar day late at night, even though UTC has already rolled over", () => {
    // The bug this fixes: 22:00 Argentina time on the 18th is 01:00 UTC on
    // the 19th — pure UTC midnight would (wrongly) call this "the 19th".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T01:00:00.000Z"));

    expect(todayUTC().toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("rolls over exactly at Argentina's midnight (03:00 UTC), not UTC's", () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date("2026-09-19T02:59:59.999Z"));
    expect(todayUTC().toISOString()).toBe("2026-09-18T00:00:00.000Z");

    vi.setSystemTime(new Date("2026-09-19T03:00:00.000Z"));
    expect(todayUTC().toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});
