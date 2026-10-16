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
/** Average NBA games per player per week, for the season-long view. */
export const GAMES_PER_WEEK = 3.5;
/** Players used to set the z-score baseline: roughly every rostered player in a 12-team league. */
const POOL_SIZE = 156;
/** Category win chance at or above this is a strength, at or below 1 minus it a weakness. */
const STRONG = 0.6;
const CATS_TO_WIN = 5;

// Trade search
/** A trade the other duo would lose more than this many expected categories on is unrealistic. */
const FAIR_TOLERANCE = 0.05;
/** Ranking leans toward trades both sides like: a lopsided gain counts this much less. */
const LOPSIDED_PENALTY = 0.5;
/** Gains smaller than this are noise. */
const MIN_GAIN = 0.03;
const MAX_TRADE_IDEAS = 8;
const MAX_IDEAS_PER_PARTNER = 2;
const MAX_SIDE = 3;
/** Trade value of a draft pick: pick 1 is 100, and each later pick is worth 3% less. */
const PICK_DECAY = 0.97;
const PICK_VALUE_TOP = 100;
/** Rank given to players nobody drafted. */
const UNDRAFTED_RANK = 170;
/** In a package, the 2nd and 3rd best players count for less: two dimes are not a quarter. */
const PACKAGE_WEIGHTS = [1, 0.7, 0.5];
/** Two sides are balanced when their trade values are within this share of each other. */
const BALANCE_SHARE = 0.1;
const BALANCE_MIN_SLACK = 3;

// Pickups
const MAX_PICKUPS = 8;
/** Each manager's lowest-value players considered as drops for a pickup. */
const DROP_CANDIDATES = 3;
const TARGETS_PER_CAT = 3;

export type PlayerInput = {
  playerId: number;
  name: string;
  /** One season line per projection source (ESPN today, more later). */
  projections: SeasonLine[];
  actual: SeasonLine | null;
};

/** Facts about a player that are not stats. */
export type PlayerMeta = {
  proTeamId: number;
  injuryStatus: string;
  /** ESPN fantasy team that rosters him; null = free agent. */
  onTeamId: number | null;
  draftPick: number | null;
  adp: number | null;
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
    const projected = usable.reduce((s, line) => s + line[f] / line.gp, 0) / usable.length;
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

/** How many games each player is expected to play in a window, and the lineup's game cap. */
export type GameWindow = { gamesOf: (playerId: number) => number; cap: number };

/** The season-long view: every player plays an average week. */
export const AVERAGE_WEEK: GameWindow = { gamesOf: () => GAMES_PER_WEEK, cap: STARTERS * GAMES_PER_WEEK };

/** Lineup cap for a stretch of days: 10 starters a day. */
export const lineupCap = (days: number) => STARTERS * days;

/**
 * Which of a manager's players fill his lineup in a window, and for how many games.
 * Best players go in first until the lineup's games run out, the way 10 daily
 * spots get filled. Injured reserve never plays.
 */
function fillLineup(roster: RosterPlayer[], rated: Map<number, RatedPlayer>, window: GameWindow) {
  let left = window.cap;
  const ranked = roster
    .filter((p) => !p.ir)
    .flatMap((p) => rated.get(p.id) ?? [])
    .sort((a, b) => b.value - a.value);
  return ranked.flatMap((p) => {
    const games = Math.min(window.gamesOf(p.playerId), left);
    left -= games;
    return games > 0 ? [{ p, games }] : [];
  });
}

const addLines = (a: StatLine, b: StatLine): StatLine => {
  const out = emptyLine();
  for (const f of FIELDS) out[f] = a[f] + b[f];
  return out;
};

/** A manager's projected totals and games used in a window. */
export function lineupTotals(roster: RosterPlayer[], rated: Map<number, RatedPlayer>, window: GameWindow): StatLine & { games: number } {
  const out = { ...emptyLine(), games: 0 };
  for (const { p, games } of fillLineup(roster, rated, window)) {
    out.games += games;
    for (const f of FIELDS) out[f] += p.perGame[f] * games;
  }
  return out;
}

/** Both managers' totals added together. */
export function duoTotals(duo: Duo, rosters: TeamRosters, rated: Map<number, RatedPlayer>, window: GameWindow): StatLine & { games: number } {
  const out = { ...emptyLine(), games: 0 };
  for (const team of [duo.espnA, duo.espnB]) {
    if (team === null) continue;
    const t = lineupTotals(rosters[team] ?? [], rated, window);
    out.games += t.games;
    for (const f of FIELDS) out[f] += t[f];
  }
  return out;
}

const chancesVs = (mine: StatLine, theirs: StatLine) => CATS.map((cat) => catWinChance(mine, theirs, cat));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const allSeasonTotals = (duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>) =>
  new Map<string, StatLine>(duos.map((d) => [d.id, duoTotals(d, rosters, rated, AVERAGE_WEEK)]));

/** Average expected categories a duo wins in an average week across its possible opponents. */
function seasonExpectedCats(duoId: string, totals: Map<string, StatLine>): number {
  const mine = totals.get(duoId)!;
  const others = [...totals.entries()].filter(([id]) => id !== duoId);
  return sum(others.map(([, t]) => sum(chancesVs(mine, t)))) / (others.length || 1);
}

export type CategoryReport = {
  cat: Category;
  weekly: number | null;
  rank: number;
  winChance: number;
  verdict: "strength" | "weakness" | "even";
};

export type MatchupOutlook = { duo: Duo; expectedCats: number; winChance: number };

export type SeasonReport = { expectedCats: number; categories: CategoryReport[]; outlook: MatchupOutlook[] };

/** Season-long strengths and weaknesses, and an average-week matchup against every other duo. */
export function seasonReport(duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>, me: Duo): SeasonReport {
  const totals = allSeasonTotals(duos, rosters, rated);
  const mine = totals.get(me.id)!;
  const opponents = duos.filter((d) => d.id !== me.id);
  const vs = opponents.map((d) => chancesVs(mine, totals.get(d.id)!));
  const categories: CategoryReport[] = CATS.map((cat, i) => {
    const value = catValue(mine, cat) ?? 0;
    const better = duos.filter((d) => {
      const v = catValue(totals.get(d.id)!, cat) ?? 0;
      return cat.low ? v < value : v > value;
    }).length;
    const w = sum(vs.map((c) => c[i])) / (vs.length || 1);
    return { cat, weekly: catValue(mine, cat), rank: better + 1, winChance: w, verdict: w >= STRONG ? "strength" : w <= 1 - STRONG ? "weakness" : "even" };
  });
  const outlook = opponents.map((d, i) => ({ duo: d, expectedCats: sum(vs[i]), winChance: matchupWinChance(vs[i]) }));
  return { expectedCats: seasonExpectedCats(me.id, totals), categories, outlook };
}

export type CatLine = { cat: Category; mine: number | null; theirs: number | null; winChance: number };

export type Pickup = {
  add: RatedPlayer;
  addGames: number;
  drop: RatedPlayer;
  dropFrom: string;
  /** Change in expected categories won this week against this week's opponent. */
  weekGain: number;
  /** Change in expected categories in an average week: the rest-of-season effect. */
  seasonGain: number;
};

export type CategoryTarget = { cat: Category; winChance: number; players: { player: RatedPlayer; games: number }[] };

export type WeekReport = {
  opponent: Duo;
  cats: CatLine[];
  myGames: number;
  theirGames: number;
  expectedCats: number;
  winChance: number;
  pickups: Pickup[];
  targets: CategoryTarget[];
};

/**
 * One week's matchup against that week's opponent: stats already played plus a
 * projection for the games left, then the free agents that help most this week.
 */
export function weekReport(args: {
  duos: Duo[];
  rosters: TeamRosters;
  rated: Map<number, RatedPlayer>;
  me: Duo;
  opponent: Duo;
  window: GameWindow;
  /** Stats already in the books this week, per side (zeros before the week starts). */
  playedMine: StatLine;
  playedTheirs: StatLine;
  freeAgents: number[];
}): WeekReport {
  const { duos, rosters, rated, me, opponent, window, playedMine, playedTheirs, freeAgents } = args;
  const projMine = duoTotals(me, rosters, rated, window);
  const projTheirs = duoTotals(opponent, rosters, rated, window);
  const mine = addLines(playedMine, projMine);
  const theirs = addLines(playedTheirs, projTheirs);
  const chances = chancesVs(mine, theirs);

  // Pickups: each free agent in place of each manager's weakest few players; keep his best swap.
  const seasonBefore = seasonExpectedCats(me.id, allSeasonTotals(duos, rosters, rated));
  const weekBefore = sum(chances);
  const drops = [me.espnA, me.espnB].flatMap((team) => {
    if (team === null) return [];
    const manager = team === me.espnA ? me.a : me.b;
    return (rosters[team] ?? [])
      .filter((p) => !p.ir && rated.has(p.id))
      .sort((a, b) => rated.get(a.id)!.value - rated.get(b.id)!.value)
      .slice(0, DROP_CANDIDATES)
      .map((p) => ({ team, manager, player: p }));
  });
  const pickups: Pickup[] = [];
  for (const id of freeAgents) {
    const add = rated.get(id);
    if (!add) continue;
    let best: { d: (typeof drops)[number]; weekGain: number; swapped: TeamRosters } | null = null;
    for (const d of drops) {
      const swapped = { ...rosters, [d.team]: rosters[d.team].map((p) => (p.id === d.player.id ? { id, name: add.name } : p)) };
      const weekGain = sum(chancesVs(addLines(playedMine, duoTotals(me, swapped, rated, window)), theirs)) - weekBefore;
      if (!best || weekGain > best.weekGain) best = { d, weekGain, swapped };
    }
    if (!best || best.weekGain <= 0) continue;
    pickups.push({
      add, addGames: window.gamesOf(id), drop: rated.get(best.d.player.id)!, dropFrom: best.d.manager, weekGain: best.weekGain,
      seasonGain: seasonExpectedCats(me.id, allSeasonTotals(duos, best.swapped, rated)) - seasonBefore,
    });
  }
  pickups.sort((x, y) => y.weekGain - x.weekGain || y.seasonGain - x.seasonGain);

  // Categories I am more likely to lose than win: free agents who add the most of it this week.
  const targets = CATS.flatMap((cat, i) => {
    if (chances[i] >= 0.5) return [];
    const players = freeAgents
      .flatMap((id) => rated.get(id) ?? [])
      .map((player) => ({ player, games: window.gamesOf(player.playerId) }))
      .filter((x) => x.games > 0)
      .sort((a, b) => b.player.z[cat.key] * b.games - a.player.z[cat.key] * a.games)
      .slice(0, TARGETS_PER_CAT);
    return [{ cat, winChance: chances[i], players }];
  });

  return {
    opponent,
    cats: CATS.map((cat, i) => ({ cat, mine: catValue(mine, cat), theirs: catValue(theirs, cat), winChance: chances[i] })),
    myGames: projMine.games,
    theirGames: projTheirs.games,
    expectedCats: sum(chances),
    winChance: matchupWinChance(chances),
    pickups: pickups.slice(0, MAX_PICKUPS),
    targets,
  };
}

/** What a player would fetch in a trade, from where he went in this league's draft. */
export function tradeValue(meta: PlayerMeta | undefined): number {
  const rank = meta?.draftPick ?? meta?.adp ?? UNDRAFTED_RANK;
  return PICK_VALUE_TOP * PICK_DECAY ** (rank - 1);
}

/** A package's value: best player at full weight, the rest discounted. */
export function packageValue(values: number[]): number {
  return [...values].sort((a, b) => b - a).reduce((s, v, i) => s + v * (PACKAGE_WEIGHTS[i] ?? 0), 0);
}

const balanced = (a: number, b: number) => Math.abs(a - b) <= Math.max(BALANCE_MIN_SLACK, BALANCE_SHARE * Math.max(a, b));

/** Every group of 1 to MAX_SIDE items. */
function packages<T>(items: T[]): T[][] {
  const out: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (picked.length) out.push(picked);
    if (picked.length === MAX_SIDE) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...picked, items[i]]);
  };
  walk(0, []);
  return out;
}

export type TradeIdea = {
  give: RatedPlayer[];
  giveFrom: string;
  get: RatedPlayer[];
  getFrom: string;
  partnerDuo: Duo;
  myGain: number;
  theirGain: number;
  giveValue: number;
  getValue: number;
  /** Positive: I receive more players than I send and must drop that many. */
  rosterChange: number;
};

/**
 * Trades of 1 to 3 players a side (at most one extra player, never 3-for-3) with a
 * manager on another duo. A trade is listed only when both packages are worth about
 * the same by this league's draft, my duo gains, and theirs gains or barely loses.
 * Ideas where both duos gain about equally rank first, since those get accepted.
 * Trades with my own partner are never suggested; the league bans them.
 */
export function tradeIdeas(duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>, meta: Map<number, PlayerMeta>, me: Duo): TradeIdea[] {
  const owner = new Map<number, { duo: Duo; name: string }>();
  for (const d of duos) {
    if (d.espnA !== null) owner.set(d.espnA, { duo: d, name: d.a });
    if (d.espnB !== null) owner.set(d.espnB, { duo: d, name: d.b });
  }
  const myTeams = [me.espnA, me.espnB].filter((t): t is number => t !== null);
  const totals = allSeasonTotals(duos, rosters, rated);
  const myBefore = seasonExpectedCats(me.id, totals);
  const tradeable = (team: number) =>
    packages((rosters[team] ?? []).filter((p) => !p.ir && rated.has(p.id))).map((ps) => ({
      players: ps,
      value: packageValue(ps.map((p) => tradeValue(meta.get(p.id)))),
    }));

  const ideas: TradeIdea[] = [];
  for (const myTeam of myTeams) {
    const mine = tradeable(myTeam);
    for (const theirTeam of [...owner.keys()].filter((t) => !myTeams.includes(t))) {
      const partner = owner.get(theirTeam)!.duo;
      const theirBefore = seasonExpectedCats(partner.id, totals);
      const theirs = tradeable(theirTeam);
      for (const g of mine) {
        for (const t of theirs) {
          const [ng, nt] = [g.players.length, t.players.length];
          if (Math.abs(ng - nt) > 1 || (ng === MAX_SIDE && nt === MAX_SIDE)) continue;
          if (!balanced(g.value, t.value)) continue;
          const giving = new Set(g.players.map((p) => p.id));
          const getting = new Set(t.players.map((p) => p.id));
          const swapped: TeamRosters = {
            ...rosters,
            [myTeam]: [...rosters[myTeam].filter((p) => !giving.has(p.id)), ...t.players],
            [theirTeam]: [...rosters[theirTeam].filter((p) => !getting.has(p.id)), ...g.players],
          };
          const after = new Map(totals);
          after.set(me.id, duoTotals(me, swapped, rated, AVERAGE_WEEK));
          after.set(partner.id, duoTotals(partner, swapped, rated, AVERAGE_WEEK));
          const myGain = seasonExpectedCats(me.id, after) - myBefore;
          if (myGain < MIN_GAIN) continue;
          const theirGain = seasonExpectedCats(partner.id, after) - theirBefore;
          if (theirGain < -FAIR_TOLERANCE) continue;
          ideas.push({
            give: g.players.map((p) => rated.get(p.id)!), giveFrom: owner.get(myTeam)!.name,
            get: t.players.map((p) => rated.get(p.id)!), getFrom: owner.get(theirTeam)!.name,
            partnerDuo: partner, myGain, theirGain, giveValue: g.value, getValue: t.value, rosterChange: nt - ng,
          });
        }
      }
    }
  }
  // Win-win first, at most a couple per trade partner, and never the same incoming players twice.
  const appeal = (i: TradeIdea) => i.myGain + i.theirGain - LOPSIDED_PENALTY * Math.abs(i.myGain - i.theirGain);
  const perPartner = new Map<string, number>();
  const seen = new Set<string>();
  return ideas
    .sort((x, y) => appeal(y) - appeal(x))
    .filter((i) => {
      // Same incoming players, or the same package sent to the same manager, is a near duplicate.
      const getKey = i.get.map((p) => p.playerId).sort().join(",");
      const giveKey = `${i.give.map((p) => p.playerId).sort().join(",")}>${i.getFrom}`;
      const n = perPartner.get(i.getFrom) ?? 0;
      if (seen.has(getKey) || seen.has(giveKey) || n >= MAX_IDEAS_PER_PARTNER) return false;
      seen.add(getKey);
      seen.add(giveKey);
      perPartner.set(i.getFrom, n + 1);
      return true;
    })
    .slice(0, MAX_TRADE_IDEAS);
}
