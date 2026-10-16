import type { Duo, StatLine } from "@/types/league";
import type { RosterPlayer, SeasonLine } from "@/lib/espn";
import { CATS, FIELDS, catValue, emptyLine, type Category } from "@/lib/scoring";

/**
 * How many games of real stats it takes for a player's actual numbers to count as
 * much as his projection. Early in the season projections dominate; by 30 games
 * the actual stats carry two thirds of the weight.
 */
export const PRIOR_GAMES = 15;
/** Lineup spots that score each day (10 starters). Bench and IR do not count. */
const STARTERS = 10;
/** Average NBA games per player per week. Scales per-game numbers to a matchup week. */
export const GAMES_PER_WEEK = 3.5;
/** Players used to set the z-score baseline: roughly every rostered player in a 12-team league. */
const POOL_SIZE = 156;
/** Category win chance at or above this is a strength, at or below 1 minus it a weakness. */
const STRONG = 0.6;
/** A trade the other duo would lose more than this many expected categories on is unrealistic. */
const FAIR_TOLERANCE = 0.05;
const MAX_TRADE_IDEAS = 10;
const CATS_TO_WIN = 5;

export type PlayerInput = {
  playerId: number;
  name: string;
  /** One season line per projection source (ESPN today, more later). */
  projections: SeasonLine[];
  actual: SeasonLine | null;
};

export type RatedPlayer = {
  playerId: number;
  name: string;
  perGame: StatLine;
  /** Sum of per-category z-scores. Higher is a more valuable 9-cat player. */
  value: number;
  /** z-score per category key, turnovers already flipped so higher is always better. */
  z: Record<string, number>;
  actualGames: number;
};

/** Per-game line: projections averaged across sources, then blended with actual games played. */
export function blendPerGame(p: PlayerInput): StatLine | null {
  const usable = p.projections.filter((s) => s.gp > 0);
  const actual = p.actual && p.actual.gp > 0 ? p.actual : null;
  if (!usable.length && !actual) return null;
  const out = emptyLine();
  for (const f of FIELDS) {
    if (!usable.length) {
      out[f] = actual![f] / actual!.gp;
      continue;
    }
    const projected = usable.reduce((sum, s) => sum + s[f] / s.gp, 0) / usable.length;
    // Shrink toward the projection: PRIOR_GAMES of projected play plus every real game.
    out[f] = actual ? (projected * PRIOR_GAMES + actual[f]) / (PRIOR_GAMES + actual.gp) : projected;
  }
  return out;
}

/** Percentage categories are rated by impact (made shots above average), so volume matters. */
const contribution = (line: StatLine, cat: Category, leaguePct: Record<string, number>): number => {
  if (!cat.pct) return line[cat.field!];
  const [made, att] = cat.pct;
  return line[made] - leaguePct[cat.key] * line[att];
};

/**
 * Rate every player with standard 9-cat z-scores. The baseline is the top POOL_SIZE
 * players, found with a first pass over everyone.
 */
export function ratePlayers(players: PlayerInput[]): Map<number, RatedPlayer> {
  const lines = players.flatMap((p) => {
    const perGame = blendPerGame(p);
    return perGame ? [{ p, perGame }] : [];
  });
  const score = (pool: typeof lines) => {
    const leaguePct: Record<string, number> = {};
    for (const cat of CATS.filter((c) => c.pct)) {
      const [made, att] = cat.pct!;
      const totalAtt = pool.reduce((s, x) => s + x.perGame[att], 0);
      leaguePct[cat.key] = totalAtt > 0 ? pool.reduce((s, x) => s + x.perGame[made], 0) / totalAtt : 0;
    }
    const stats = CATS.map((cat) => {
      const vals = pool.map((x) => contribution(x.perGame, cat, leaguePct));
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1)) || 1;
      return { cat, mean, sd };
    });
    return (line: StatLine) => {
      const z: Record<string, number> = {};
      for (const { cat, mean, sd } of stats) {
        const raw = (contribution(line, cat, leaguePct) - mean) / sd;
        z[cat.key] = cat.low ? -raw : raw;
      }
      return { z, value: Object.values(z).reduce((a, b) => a + b, 0) };
    };
  };
  const firstPass = score(lines);
  const pool = [...lines].sort((a, b) => firstPass(b.perGame).value - firstPass(a.perGame).value).slice(0, POOL_SIZE);
  const final = score(pool);
  return new Map(
    lines.map(({ p, perGame }) => {
      const { z, value } = final(perGame);
      return [p.playerId, { playerId: p.playerId, name: p.name, perGame, value, z, actualGames: p.actual?.gp ?? 0 }];
    }),
  );
}

/** Abramowitz-Stegun approximation of the standard normal CDF (error under 1e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** A manager's scoring lineup: his best STARTERS healthy players by value. */
export function starters(roster: RosterPlayer[], rated: Map<number, RatedPlayer>): RatedPlayer[] {
  return roster
    .filter((p) => !p.ir)
    .flatMap((p) => rated.get(p.id) ?? [])
    .sort((a, b) => b.value - a.value)
    .slice(0, STARTERS);
}

/** Projected weekly totals for a lineup. */
export function weeklyTotals(lineup: RatedPlayer[]): StatLine {
  const out = emptyLine();
  for (const p of lineup) for (const f of FIELDS) out[f] += p.perGame[f] * GAMES_PER_WEEK;
  return out;
}

/**
 * Chance duo A beats duo B in one category over a week. Counting stats are treated
 * as Poisson (variance = mean); percentages as binomial on the week's attempts.
 */
export function catWinChance(a: StatLine, b: StatLine, cat: Category): number {
  const va = catValue(a, cat);
  const vb = catValue(b, cat);
  if (va === null || vb === null) return 0.5;
  let variance: number;
  if (cat.pct) {
    const att = cat.pct[1];
    variance = (va * (1 - va)) / (a[att] || 1) + (vb * (1 - vb)) / (b[att] || 1);
  } else {
    variance = va + vb;
  }
  const z = (va - vb) / Math.sqrt(variance || 1);
  return normCdf(cat.low ? -z : z);
}

/** Chance of winning at least 5 of the 9 categories, given each category's win chance. */
export function matchupWinChance(chances: number[]): number {
  // Distribution of categories won (Poisson binomial), built one category at a time.
  let dist = [1];
  for (const p of chances) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist.slice(CATS_TO_WIN).reduce((a, b) => a + b, 0);
}

export type TeamRosters = Record<number, RosterPlayer[]>;

type DuoTotals = Map<string, StatLine>;

/** Weekly totals for every duo: both managers' starters added together. */
function allDuoTotals(duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>): DuoTotals {
  return new Map(
    duos.map((d) => {
      const both = [d.espnA, d.espnB].flatMap((team) => (team === null ? [] : starters(rosters[team] ?? [], rated)));
      return [d.id, weeklyTotals(both)];
    }),
  );
}

/** Average expected categories a duo wins per week across its 5 possible opponents. */
function expectedCats(duoId: string, totals: DuoTotals): number {
  const mine = totals.get(duoId)!;
  const opponents = [...totals.keys()].filter((id) => id !== duoId);
  const sum = opponents.reduce((s, id) => s + CATS.reduce((c, cat) => c + catWinChance(mine, totals.get(id)!, cat), 0), 0);
  return sum / (opponents.length || 1);
}

/** Average win chance per category across the 5 opponents. */
function catChances(duoId: string, totals: DuoTotals): Record<string, number> {
  const mine = totals.get(duoId)!;
  const opponents = [...totals.keys()].filter((id) => id !== duoId);
  return Object.fromEntries(
    CATS.map((cat) => [cat.key, opponents.reduce((s, id) => s + catWinChance(mine, totals.get(id)!, cat), 0) / (opponents.length || 1)]),
  );
}

export type CategoryReport = {
  cat: Category;
  weekly: number | null;
  rank: number;
  winChance: number;
  verdict: "strength" | "weakness" | "even";
};

export type MatchupOutlook = { duo: Duo; expectedCats: number; winChance: number; byCat: Record<string, number> };

export type TradeIdea = {
  give: RatedPlayer;
  giveFrom: string;
  get: RatedPlayer;
  getFrom: string;
  partnerDuo: Duo;
  myGain: number;
  theirGain: number;
  /** Categories this trade moves the most for my duo, as win-chance changes. */
  catShift: { key: string; label: string; change: number }[];
};

export type Report = {
  duo: Duo;
  categories: CategoryReport[];
  outlook: MatchupOutlook[];
  roster: { player: RatedPlayer; manager: string; starter: boolean; ir: boolean }[];
  trades: TradeIdea[];
  expectedCats: number;
};

/** Every analytic on the admin page, for one duo. */
export function buildReport(duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>, duoId: string): Report {
  const duo = duos.find((d) => d.id === duoId)!;
  const totals = allDuoTotals(duos, rosters, rated);
  const mine = totals.get(duoId)!;
  const chances = catChances(duoId, totals);

  const categories: CategoryReport[] = CATS.map((cat) => {
    const values = duos.map((d) => catValue(totals.get(d.id)!, cat) ?? 0);
    const value = catValue(mine, cat);
    const better = values.filter((v) => (cat.low ? v < (value ?? 0) : v > (value ?? 0))).length;
    const w = chances[cat.key];
    return { cat, weekly: value, rank: better + 1, winChance: w, verdict: w >= STRONG ? "strength" : w <= 1 - STRONG ? "weakness" : "even" };
  });

  const outlook = duos
    .filter((d) => d.id !== duoId)
    .map((d) => {
      const byCat = Object.fromEntries(CATS.map((cat) => [cat.key, catWinChance(mine, totals.get(d.id)!, cat)]));
      const list = Object.values(byCat);
      return { duo: d, expectedCats: list.reduce((a, b) => a + b, 0), winChance: matchupWinChance(list), byCat };
    });

  const roster = (["a", "b"] as const).flatMap((side) => {
    const team = side === "a" ? duo.espnA : duo.espnB;
    if (team === null) return [];
    const lineup = new Set(starters(rosters[team] ?? [], rated).map((p) => p.playerId));
    return (rosters[team] ?? []).flatMap((p) => {
      const player = rated.get(p.id);
      return player ? [{ player, manager: duo[side], starter: lineup.has(p.id), ir: !!p.ir }] : [];
    });
  });

  return { duo, categories, outlook, roster, trades: tradeIdeas(duos, rosters, rated, duo, totals), expectedCats: expectedCats(duoId, totals) };
}

/**
 * Every 1-for-1 swap between one of my duo's players and a player on another duo.
 * A swap counts as an idea when it raises my expected categories and the other duo
 * would plausibly say yes (they gain, or lose at most FAIR_TOLERANCE expected categories).
 * Trades with my own partner are never suggested; the league bans them.
 */
export function tradeIdeas(duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>, duo: Duo, totals: DuoTotals): TradeIdea[] {
  const managerOf = new Map<number, { duo: Duo; name: string }>();
  for (const d of duos) {
    if (d.espnA !== null) managerOf.set(d.espnA, { duo: d, name: d.a });
    if (d.espnB !== null) managerOf.set(d.espnB, { duo: d, name: d.b });
  }
  const myTeams = [duo.espnA, duo.espnB].filter((t): t is number => t !== null);
  const otherTeams = [...managerOf.keys()].filter((t) => !myTeams.includes(t));
  const myBefore = expectedCats(duo.id, totals);
  const myChancesBefore = catChances(duo.id, totals);
  const ideas: TradeIdea[] = [];

  for (const myTeam of myTeams) {
    for (const theirTeam of otherTeams) {
      const partner = managerOf.get(theirTeam)!.duo;
      const theirBefore = expectedCats(partner.id, totals);
      for (const give of rosters[myTeam] ?? []) {
        for (const get of rosters[theirTeam] ?? []) {
          if (give.ir || get.ir || !rated.has(give.id) || !rated.has(get.id)) continue;
          const swapped: TeamRosters = {
            ...rosters,
            [myTeam]: rosters[myTeam].map((p) => (p.id === give.id ? get : p)),
            [theirTeam]: rosters[theirTeam].map((p) => (p.id === get.id ? give : p)),
          };
          const after = allDuoTotals(duos, swapped, rated);
          const myGain = expectedCats(duo.id, after) - myBefore;
          const theirGain = expectedCats(partner.id, after) - theirBefore;
          if (myGain <= 0 || theirGain < -FAIR_TOLERANCE) continue;
          const chancesAfter = catChances(duo.id, after);
          const catShift = CATS.map((c) => ({ key: c.key, label: c.label, change: chancesAfter[c.key] - myChancesBefore[c.key] }))
            .filter((c) => Math.abs(c.change) >= 0.01)
            .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
            .slice(0, 4);
          ideas.push({
            give: rated.get(give.id)!, giveFrom: managerOf.get(myTeam)!.name,
            get: rated.get(get.id)!, getFrom: managerOf.get(theirTeam)!.name,
            partnerDuo: partner, myGain, theirGain, catShift,
          });
        }
      }
    }
  }
  // Best idea per player I would receive, so one target is not listed once per bench player I could send.
  const best = new Map<number, TradeIdea>();
  for (const idea of ideas.sort((x, y) => y.myGain - x.myGain)) if (!best.has(idea.get.playerId)) best.set(idea.get.playerId, idea);
  return [...best.values()].slice(0, MAX_TRADE_IDEAS);
}
