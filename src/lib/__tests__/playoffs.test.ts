import { describe, expect, it } from "vitest";
import { computeBracket, gamesForWeek } from "@/lib/playoffs";
import { emptyLine } from "@/lib/scoring";
import { defaultConfig, spanRange } from "@/lib/season";
import type { LeagueState, StatLine } from "@/types/league";

const line = (pts: number): StatLine => ({ ...emptyLine(), pts });

/** A one-week regular season where d1 > d2 > ... > d6 on points, so seeds are d1..d4. */
function seededState(overrides: Partial<LeagueState["config"]> = {}): Pick<LeagueState, "config" | "scores" | "final"> {
  const config = { ...defaultConfig(), regularWeeks: 1, weeks: 3, ...overrides };
  // Week 1 round robin: d1-d6, d2-d5, d3-d4.
  const scores: LeagueState["scores"] = { 1: { d1a: line(100), d6a: line(10), d2a: line(90), d5a: line(20), d3a: line(80), d4a: line(30) } };
  return { config, scores, final: { 1: true } };
}

describe("playoff bracket", () => {
  it("seeds the top four and defaults the 1st seed to play the 4th", () => {
    const b = computeBracket(seededState());
    expect(b.semisWeek).toBe(2);
    expect(b.finalsWeek).toBe(3);
    expect(b.semis[0].a?.id).toBe(b.seeds[0].id);
    expect(b.semis[0].b?.id).toBe(b.seeds[3].id);
    expect(b.seed1Picked).toBe(false);
    expect(gamesForWeek(seededState(), 2).map((g) => g.label)).toEqual(["Semifinal", "Semifinal", "Last place game"]);
    expect(b.lastPlace.seedA).toBe(5);
    expect(b.lastPlace.seedB).toBe(6);
  });

  it("lets the 1st seed pick its opponent", () => {
    const base = computeBracket(seededState());
    const pick = base.seeds[1].id;
    const b = computeBracket(seededState({ seed1Pick: pick }));
    expect(b.semis[0].b?.id).toBe(pick);
    expect(new Set([b.semis[1].a?.id, b.semis[1].b?.id])).toEqual(new Set([base.seeds[2].id, base.seeds[3].id]));
  });

  it("gives a tied playoff game to the higher seed and builds the finals", () => {
    const s = seededState();
    const b0 = computeBracket(s);
    const [s1, s2, s3, s4] = b0.seeds.map((d) => `${d.id}a`);
    // Semis: 1 vs 4 tied everywhere, 2 vs 3 won by 3.
    s.scores[2] = { [s1]: line(50), [s4]: line(50), [s2]: line(10), [s3]: line(60) };
    s.final[2] = true;
    const b = computeBracket(s);
    expect(b.semis[0].winner?.id).toBe(b0.seeds[0].id);
    expect(b.semis[1].winner?.id).toBe(b0.seeds[2].id);
    const finals = gamesForWeek(s, 3, b);
    expect(finals.map((g) => g.label)).toEqual(["Final", "3rd place game"]);
    expect(finals[0].a?.id).toBe(b0.seeds[0].id);
    expect(finals[0].b?.id).toBe(b0.seeds[2].id);
  });

  it("settles all six places after the finals and the last place game", () => {
    const s = seededState();
    const before = computeBracket(s);
    const seeds = before.seeds.map((d) => `${d.id}a`);
    const [fifth, sixth] = before.regularRows.slice(4).map((r) => `${r.duo.id}a`);
    // Semis week: seeds 1 and 2 advance; the 6th seed beats the 5th for 5th place.
    s.scores[2] = { [seeds[0]]: line(90), [seeds[3]]: line(10), [seeds[1]]: line(90), [seeds[2]]: line(10), [fifth]: line(5), [sixth]: line(50) };
    s.scores[3] = { [seeds[0]]: line(10), [seeds[1]]: line(90), [seeds[3]]: line(90), [seeds[2]]: line(10) };
    s.final[2] = true;
    s.final[3] = true;
    const b = computeBracket(s);
    expect(b.decided).toBe(true);
    // Seed 2 wins the final over seed 1; seed 4 takes 3rd over seed 3; 5th and 6th by record.
    const id = (i: number) => before.seeds[i].id;
    const [r5, r6] = before.regularRows.slice(4).map((r) => r.duo.id);
    expect(b.placements.map((d) => d?.id)).toEqual([id(1), id(0), id(3), id(2), r6, r5]);
  });

  it("does not count playoff weeks in the regular-season table", () => {
    const s = seededState();
    const before = computeBracket(s).seeds.map((d) => d.id);
    const outside = computeBracket(s).regularRows[5].duo.id;
    s.scores[2] = { [`${outside}a`]: line(999), [`${before[0]}a`]: line(1) };
    expect(computeBracket(s).seeds.map((d) => d.id)).toEqual(before);
  });
});

describe("spanRange", () => {
  it("covers a 22-week regular season", () => {
    expect(spanRange(1, 22)).toBe("Oct 20 to Mar 28");
  });
});
