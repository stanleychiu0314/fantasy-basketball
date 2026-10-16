import { describe, expect, it } from "vitest";
import { blendPerGame, buildReport, catWinChance, matchupWinChance, normCdf, PRIOR_GAMES, ratePlayers, type PlayerInput } from "@/lib/analytics";
import { CATS, emptyLine } from "@/lib/scoring";
import { defaultConfig } from "@/lib/season";
import type { StatLine } from "@/types/league";

const season = (perGame: Partial<StatLine>, gp = 70) => {
  const line = { ...emptyLine(), gp };
  for (const [k, v] of Object.entries(perGame)) line[k as keyof StatLine] = (v as number) * gp;
  return line;
};
const pts = CATS.find((c) => c.key === "pts")!;
const to = CATS.find((c) => c.key === "to")!;

describe("blendPerGame", () => {
  it("averages projection sources", () => {
    const p: PlayerInput = { playerId: 1, name: "A", projections: [season({ pts: 20 }), season({ pts: 30 })], actual: null };
    expect(blendPerGame(p)!.pts).toBeCloseTo(25);
  });

  it("weights actual games against PRIOR_GAMES of projection", () => {
    const p: PlayerInput = { playerId: 1, name: "A", projections: [season({ pts: 20 })], actual: season({ pts: 30 }, PRIOR_GAMES) };
    expect(blendPerGame(p)!.pts).toBeCloseTo(25);
  });

  it("uses actual stats alone when there is no projection", () => {
    expect(blendPerGame({ playerId: 1, name: "A", projections: [], actual: season({ pts: 12 }, 4) })!.pts).toBeCloseTo(12);
  });
});

describe("win chances", () => {
  it("normCdf is a CDF", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 5);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it("favors the bigger total, and the smaller one for turnovers", () => {
    const a = { ...emptyLine(), pts: 600, to: 50 };
    const b = { ...emptyLine(), pts: 500, to: 70 };
    expect(catWinChance(a, b, pts)).toBeGreaterThan(0.9);
    expect(catWinChance(a, b, to)).toBeGreaterThan(0.9);
    expect(catWinChance(a, a, pts)).toBeCloseTo(0.5);
  });

  it("needs 5 of 9 categories to win the week", () => {
    expect(matchupWinChance(new Array(9).fill(0.5))).toBeCloseTo(0.5);
    expect(matchupWinChance(new Array(9).fill(1))).toBeCloseTo(1);
  });
});

describe("trade ideas", () => {
  it("never suggest a trade between duo partners", () => {
    const config = defaultConfig();
    const duos = config.duos.map((d, i) => ({ ...d, espnA: i * 2 + 1, espnB: i * 2 + 2 }));
    const players: PlayerInput[] = [];
    const rosters: Record<number, { id: number; name: string }[]> = {};
    for (let team = 1; team <= 12; team++) {
      rosters[team] = [];
      for (let k = 0; k < 3; k++) {
        const id = team * 10 + k;
        // Uneven category profiles so some swaps help.
        players.push({ playerId: id, name: `P${id}`, projections: [season({ pts: 10 + ((id * 7) % 13), reb: 3 + ((id * 3) % 9), blk: (id % 4) * 0.5, fgm: 4, fga: 9, ftm: 2, fta: 3 })], actual: null });
        rosters[team].push({ id, name: `P${id}` });
      }
    }
    const report = buildReport(duos, rosters, ratePlayers(players), "d1");
    expect(report.trades.length).toBeGreaterThan(0);
    for (const t of report.trades) {
      expect(t.partnerDuo.id).not.toBe("d1");
      expect(t.myGain).toBeGreaterThan(0);
    }
  });
});
