import { describe, expect, it } from "vitest";
import { aggregate, computeStandings, defaultPairs, emptyLine, matchup } from "@/lib/scoring";
import { defaultConfig, weekFromDate, weekRange, SEASON_START } from "@/lib/season";
import type { StatLine } from "@/types/league";

const line = (p: Partial<StatLine>): StatLine => ({ ...emptyLine(), ...p });
const config = defaultConfig();
const [d1, d2] = config.duos;

describe("aggregate", () => {
  it("sums both managers and computes FG% from totals, not an average", () => {
    const scores = { 1: { d1a: line({ fgm: 50, fga: 100 }), d1b: line({ fgm: 120, fga: 300 }) } };
    const agg = aggregate(scores, 1, d1);
    expect(agg.fgm / agg.fga).toBeCloseTo(0.425);
  });
});

describe("matchup", () => {
  it("treats turnovers as lower-is-better and counts ties", () => {
    const scores = {
      1: {
        d1a: line({ fgm: 10, fga: 20, ftm: 5, fta: 10, pts: 100, to: 5 }),
        d2a: line({ fgm: 10, fga: 20, ftm: 4, fta: 10, pts: 90, to: 9 }),
      },
    };
    const m = matchup(scores, 1, d1, d2);
    expect(m.played).toBe(true);
    expect(m.cats.find((c) => c.cat.key === "to")?.winner).toBe(1);
    expect(m.cats.find((c) => c.cat.key === "fg")?.winner).toBe(0);
    expect(m.winsA + m.winsB + m.ties).toBe(9);
  });

  it("is not played until both duos have numbers", () => {
    expect(matchup({ 1: { d1a: line({ pts: 1 }) } }, 1, d1, d2).played).toBe(false);
  });
});

describe("schedule", () => {
  it("pairs every duo exactly once per week and everyone meets in 5 weeks", () => {
    const ids = config.duos.map((d) => d.id);
    const met = new Set<string>();
    for (let w = 1; w <= 5; w++) {
      const pairs = defaultPairs(w, ids);
      expect(new Set(pairs.flat()).size).toBe(6);
      pairs.forEach(([a, b]) => met.add([a, b].sort().join()));
    }
    expect(met.size).toBe(15);
  });
});

describe("standings", () => {
  it("ranks the matchup winner first", () => {
    const scores = { 1: { d1a: line({ pts: 100, reb: 50 }), d6a: line({ pts: 90, reb: 40 }) } };
    const { rows, lastPlayed } = computeStandings({ config, scores });
    expect(lastPlayed).toBe(1);
    expect(rows[0].duo.id).toBe("d1");
    expect(rows[0].w).toBe(1);
  });
});

describe("season calendar", () => {
  it("runs Oct 20 to Apr 11 across 24 ESPN matchups, with a two-week All-Star matchup", () => {
    expect(weekRange(1)).toBe("Oct 20 to 25");
    expect(weekRange(2)).toBe("Oct 26 to Nov 1");
    expect(weekRange(17)).toBe("Feb 8 to 14");
    expect(weekRange(18)).toBe("Feb 15 to 28");
    expect(weekRange(19)).toBe("Mar 1 to 7");
    expect(weekRange(24)).toBe("Apr 5 to 11");
    expect(weekFromDate(Date.UTC(2027, 1, 25))).toBe(18);
    expect(weekFromDate(Date.UTC(2027, 3, 11, 12))).toBe(24);
    expect(weekFromDate(SEASON_START - 1)).toBe(1);
    expect(weekFromDate(SEASON_START + 6 * 86_400_000)).toBe(2);
  });
});
