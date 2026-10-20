import { describe, expect, it } from "vitest";
import { blendPerGame, catWinChance, lineupTotals, matchupWinChance, normCdf, packageValue, PRIOR_GAMES, ratePlayers, tradeIdeas, tradeValue, weekReport, type PlayerInput, type PlayerMeta } from "@/lib/analytics";
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

describe("lineup filling", () => {
  it("plays the best players first and stops at the lineup's game cap", () => {
    const rated = ratePlayers([
      { playerId: 1, name: "Star", projections: [season({ pts: 30, reb: 10 })], actual: null },
      { playerId: 2, name: "Scrub", projections: [season({ pts: 5, reb: 1 })], actual: null },
    ]);
    const roster = [{ id: 1, name: "Star" }, { id: 2, name: "Scrub" }];
    const t = lineupTotals(roster, rated, { gamesOf: () => 3, cap: 4 });
    expect(t.games).toBe(4);
    expect(t.pts).toBeCloseTo(30 * 3 + 5 * 1);
  });

  it("skips injured reserve", () => {
    const rated = ratePlayers([{ playerId: 1, name: "Hurt", projections: [season({ pts: 30 })], actual: null }]);
    expect(lineupTotals([{ id: 1, name: "Hurt", ir: true }], rated, { gamesOf: () => 3, cap: 30 }).games).toBe(0);
  });
});

describe("trade value", () => {
  it("prices earlier draft picks higher and discounts depth in a package", () => {
    const meta = (draftPick: number): PlayerMeta => ({ proTeamId: 1, injuryStatus: "ACTIVE", onTeamId: 1, draftPick, adp: null });
    expect(tradeValue(meta(1))).toBeGreaterThan(tradeValue(meta(50)));
    expect(packageValue([10, 10])).toBeLessThan(20);
  });
});

describe("trade ideas", () => {
  it("only suggests fair trades with other duos that help me", () => {
    const config = defaultConfig();
    const duos = config.duos.map((d, i) => ({ ...d, espnA: i * 2 + 1, espnB: i * 2 + 2 }));
    const players: PlayerInput[] = [];
    const meta = new Map<number, PlayerMeta>();
    const rosters: Record<number, { id: number; name: string }[]> = {};
    for (let team = 1; team <= 12; team++) {
      rosters[team] = [];
      for (let k = 0; k < 3; k++) {
        const id = team * 10 + k;
        // Uneven category profiles so some swaps help; equal draft slots so trades are balanced.
        players.push({ playerId: id, name: `P${id}`, projections: [season({ pts: 10 + ((id * 7) % 13), reb: 3 + ((id * 3) % 9), blk: (id % 4) * 0.5, fgm: 4, fga: 9, ftm: 2, fta: 3 })], actual: null });
        meta.set(id, { proTeamId: 1, injuryStatus: "ACTIVE", onTeamId: team, draftPick: 50, adp: null });
        rosters[team].push({ id, name: `P${id}` });
      }
    }
    const ideas = tradeIdeas(duos, rosters, ratePlayers(players), meta, duos[0]);
    expect(ideas.length).toBeGreaterThan(0);
    for (const t of ideas) {
      expect(t.partnerDuo.id).not.toBe("d1");
      expect(t.myGain).toBeGreaterThan(0);
      expect(Math.abs(t.give.length - t.get.length)).toBeLessThanOrEqual(1);
    }
  });
});

describe("pickups", () => {
  it("adds without a drop when a manager has an open roster spot, and covers both managers", () => {
    const config = defaultConfig();
    const duos = config.duos.map((d, i) => ({ ...d, espnA: i * 2 + 1, espnB: i * 2 + 2 }));
    const players: PlayerInput[] = [];
    const rosters: Record<number, { id: number; name: string; ir?: boolean }[]> = {};
    for (let team = 1; team <= 12; team++) {
      rosters[team] = [];
      for (let k = 0; k < 13; k++) {
        const id = team * 100 + k;
        players.push({ playerId: id, name: `P${id}`, projections: [season({ pts: 8 + (id % 11), reb: 2 + (id % 5), stl: (id % 3) * 0.5, fgm: 4, fga: 9, ftm: 2, fta: 3 })], actual: null });
        // Team 2 has one player on IR, leaving an open spot.
        rosters[team].push({ id, name: `P${id}`, ir: team === 2 && k === 0 });
      }
    }
    const fa = 9999;
    players.push({ playerId: fa, name: "Free", projections: [season({ pts: 25, reb: 8, stl: 2, fgm: 9, fga: 18, ftm: 5, fta: 6 })], actual: null });
    const rated = ratePlayers(players);
    const report = weekReport({
      duos, rosters, rated, me: duos[0], opponent: duos[1], window: { gamesOf: () => 3, cap: 30 }, freeAgents: [fa],
      playedMine: emptyLine(), playedTheirs: emptyLine(),
    });
    const byManager = new Map(report.pickups.map((p) => [p.dropFrom, p]));
    expect(byManager.get(duos[0].a)?.drop).not.toBeNull();
    expect(byManager.get(duos[0].b)?.drop).toBeNull();
  });
});

describe("bench depth", () => {
  it("counts the top 10 fully and the bench nearly fully", async () => {
    const { DEPTH_WEIGHTS } = await import("@/lib/analytics");
    expect(DEPTH_WEIGHTS[9]).toBeCloseTo(1, 6);
    expect(DEPTH_WEIGHTS[11]).toBeCloseTo(0.994, 3);
    expect(DEPTH_WEIGHTS[12]).toBeCloseTo(0.981, 3);
  });
});

describe("day-by-day lineups", () => {
  it("starts everyone who plays each day, up to 10, best first", () => {
    const players: PlayerInput[] = Array.from({ length: 12 }, (_, i) => ({
      playerId: i + 1, name: `P${i + 1}`, projections: [season({ pts: 30 - i })], actual: null,
    }));
    const rated = ratePlayers(players);
    const roster = players.map((p) => ({ id: p.playerId, name: p.name }));
    // Day 1: all 12 play, so the 2 worst sit. Day 2: only player 12 plays, so he starts.
    const window = { gamesOf: () => 0, cap: 0, days: [1, 2], playsOn: (id: number, day: number) => day === 1 || id === 12 };
    const t = lineupTotals(roster, rated, window);
    expect(t.games).toBe(11);
    expect(t.pts).toBeCloseTo(sum(Array.from({ length: 10 }, (_, i) => 30 - i)) + 19);
  });
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
