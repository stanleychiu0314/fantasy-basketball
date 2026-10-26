import { describe, expect, it } from "vitest";
import { formatEt, gameDayAt, weekBounds, weekLockTime, weekPhase } from "@/lib/season";

// Week 1 is Tue Oct 20 to Sun Oct 25 2026 (EDT, UTC-4). Week 2 is Oct 26 to Nov 1;
// DST ends 2am Sun Nov 1, so Nov 1 evening is EST (UTC-5).

describe("weekPhase", () => {
  it("is upcoming before 00:00 ET on the first day", () => {
    // Week 1 starts Oct 20 00:00 EDT = 04:00 UTC.
    expect(weekPhase(1, false, Date.UTC(2026, 9, 20, 3, 59))).toBe("upcoming");
    expect(weekPhase(1, false, Date.UTC(2026, 9, 20, 4, 0))).toBe("live");
  });

  it("flips from live to pending at 23:59 ET on the last day (EDT)", () => {
    // 23:58 EDT Oct 25 = 03:58 UTC Oct 26.
    expect(weekPhase(1, false, Date.UTC(2026, 9, 26, 3, 58))).toBe("live");
    expect(weekPhase(1, false, Date.UTC(2026, 9, 26, 3, 59))).toBe("pending");
    expect(weekPhase(1, false, Date.UTC(2026, 9, 26, 12, 0))).toBe("pending");
  });

  it("uses EST for a week that ends after DST ends", () => {
    // 23:58 EST Nov 1 = 04:58 UTC Nov 2.
    expect(weekPhase(2, false, Date.UTC(2026, 10, 2, 4, 58))).toBe("live");
    expect(weekPhase(2, false, Date.UTC(2026, 10, 2, 4, 59))).toBe("pending");
    // The EDT cutoff would have been an hour earlier and must not apply.
    expect(weekPhase(2, false, Date.UTC(2026, 10, 2, 3, 59))).toBe("live");
  });

  it("starts week 3 at 00:00 EST (after DST ends)", () => {
    // Nov 2 00:00 EST = 05:00 UTC.
    expect(weekPhase(3, false, Date.UTC(2026, 10, 2, 4, 59))).toBe("upcoming");
    expect(weekPhase(3, false, Date.UTC(2026, 10, 2, 5, 0))).toBe("live");
  });

  it("final wins over every time", () => {
    expect(weekPhase(1, true, Date.UTC(2026, 9, 1))).toBe("final");
    expect(weekPhase(1, true, Date.UTC(2026, 9, 22))).toBe("final");
    expect(weekPhase(1, true, Date.UTC(2026, 11, 1))).toBe("final");
  });
});

describe("weekLockTime", () => {
  it("is Monday 10:00 UTC after the week's last day", () => {
    expect(new Date(weekLockTime(1)).toISOString()).toBe("2026-10-26T10:00:00.000Z");
    expect(new Date(weekLockTime(2)).toISOString()).toBe("2026-11-02T10:00:00.000Z");
  });

  it("falls after the pending cutoff and before the next week's first sync", () => {
    expect(weekLockTime(1)).toBeGreaterThan(weekBounds(1)[1] + 86_400_000);
    expect(weekLockTime(1)).toBeLessThan(weekLockTime(2));
  });
});

describe("formatEt", () => {
  it("shows New York time whatever the server zone, across the DST change", () => {
    expect(formatEt("2026-10-26T10:04:00Z")).toBe("Mon, Oct 26, 6:04 AM ET");
    expect(formatEt(Date.UTC(2026, 10, 2, 10, 4))).toBe("Mon, Nov 2, 5:04 AM ET");
  });
});

describe("gameDayAt", () => {
  it("follows New York's calendar date, not UTC's", () => {
    expect(gameDayAt(Date.UTC(2026, 9, 20, 4, 0))).toBe(1);
    // Sun Oct 25 11:59 PM EDT is day 6; Mon Oct 26 9 PM EDT (Tue in UTC) is still day 7.
    expect(gameDayAt(Date.UTC(2026, 9, 26, 3, 59))).toBe(6);
    expect(gameDayAt(Date.UTC(2026, 9, 27, 1, 0))).toBe(7);
  });
});
