import { describe, expect, it } from "vitest";
import { emptyLine } from "@/lib/scoring";
import { teammateReport } from "@/lib/teammates";
import type { Duo, StatLine } from "@/types/league";

const line = (p: Partial<StatLine>): StatLine => ({ ...emptyLine(), ...p });
const duo: Duo = { id: "d1", name: "Smashing Balls", a: "Adam", b: "Stanley", espnA: 1, espnB: 2 };

describe("teammateReport", () => {
  it("counts wins, treats turnovers as lower-is-better, and counts ties", () => {
    // a wins PTS and TO (fewer); b wins REB; every other category is a tie.
    const scores = { 1: { d1a: line({ pts: 100, reb: 40, to: 10 }), d1b: line({ pts: 90, reb: 50, to: 20 }) } };
    const { total } = teammateReport(scores, duo, 3);
    expect(total).toEqual({ a: 2, b: 1, ties: 6 });
  });

  it("skips weeks missing either manager and groups weeks by start month", () => {
    const win = { d1a: line({ pts: 2 }), d1b: line({ pts: 1 }) };
    // Week 1 starts Oct 20, week 2 Oct 26, week 3 Nov 2 (2026).
    const scores = { 1: win, 2: { d1a: line({ pts: 5 }) }, 3: win };
    const r = teammateReport(scores, duo, 4);
    expect(r.months.map((m) => [m.label, m.weeks.map((w) => w.week)])).toEqual([
      ["October 2026", [1]],
      ["November 2026", [3]],
    ]);
    expect(r.total.a).toBe(2);
  });
});
