import type { Duo, StatLine } from "@/types/league";
import type { RosterPlayer, SeasonLine } from "@/lib/espn";
import { CATS, FIELDS, catValue, emptyLine, type Category } from "@/lib/scoring";
import { ROSTER_SIZE } from "@/lib/season";

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
/** Trade ideas listed for each of my managers, so both rosters get suggestions. */
const TRADES_PER_MANAGER = 5;
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
/** Pickups listed for each manager, so both rosters get suggestions. */
const PICKUPS_PER_MANAGER = 5;
/** Each manager's lowest-value players considered as drops for a pickup. */
const DROP_CANDIDATES = 3;
const TARGETS_PER_CAT = 3;
/** A pickup that costs more than this many expected categories over the rest of the season is only a stream. */
const STREAM_THRESHOLD = 0.1;

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
 * Standard 9-cat z-scores against a pool of per-game lines: each category's mean and
 * spread come from the pool, percentages count by impact, and turnovers are flipped so
 * higher is always better. `value` is the sum across categories.
 */
export function zScorer(pool: StatLine[]): (line: StatLine) => { z: Record<string, number>; value: number } {
  const leaguePct: Record<string, number> = {};
  for (const cat of CATS.filter((c) => c.pct)) {
    const [made, att] = cat.pct!;
    const totalAtt = pool.reduce((s, x) => s + x[att], 0);
    leaguePct[cat.key] = totalAtt > 0 ? pool.reduce((s, x) => s + x[made], 0) / totalAtt : 0;
  }
  const stats = CATS.map((cat) => {
    const vals = pool.map((x) => contribution(x, cat, leaguePct));
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
}

/**
 * Rate every player with standard 9-cat z-scores. The baseline is the top POOL_SIZE
 * players, found with a first pass over everyone.
 */
export function ratePlayers(players: PlayerInput[]): Map<number, RatedPlayer> {
  const lines = players.flatMap((p) => {
    const perGame = blendPerGame(p);
    return perGame ? [{ p, perGame }] : [];
  });
  const score = (pool: typeof lines) => zScorer(pool.map((x) => x.perGame));
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

/**
 * How many games each player is expected to play in a window, the lineup's game cap,
 * and optionally the share of games that count by roster rank (best player first).
 */
export type GameWindow = {
  gamesOf: (playerId: number) => number;
  cap: number;
  rankWeights?: number[];
  /**
   * Day-by-day mode: the game days in the window and who plays on each. When set, each
   * day's lineup is simulated: everyone playing that day starts, best first, up to 10.
   */
  days?: number[];
  playsOn?: (playerId: number, day: number) => boolean;
};

/** P(X <= x) for X ~ Binomial(n, p). */
function binomCdf(n: number, p: number, x: number): number {
  let term = (1 - p) ** n;
  let total = term;
  for (let k = 1; k <= Math.min(n, x); k++) {
    term *= ((n - k + 1) / k) * (p / (1 - p));
    total += term;
  }
  return Math.min(1, total);
}

const DAYS_PER_WEEK = 7;
/** An NBA team plays about every other day. */
const PLAY_CHANCE = GAMES_PER_WEEK / DAYS_PER_WEEK;
const MAX_ROSTER_RANK = 20;

/**
 * Season view: the share of a player's games that count, by his rank on the roster.
 * His game counts unless 10 better teammates also play that day, so the top 10 count
 * fully and bench players nearly fully (12th: 99%, 13th: 98%). Bench depth matters.
 * shortcut: treats teams' game days as independent; real busy nights overflow a little more.
 */
export const DEPTH_WEIGHTS = Array.from({ length: MAX_ROSTER_RANK }, (_, rank) => binomCdf(rank, PLAY_CHANCE, STARTERS - 1));

/** The season-long view: every active player plays an average week, weighted by roster depth. */
export const AVERAGE_WEEK: GameWindow = { gamesOf: () => GAMES_PER_WEEK, cap: Infinity, rankWeights: DEPTH_WEIGHTS };

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
  if (window.days && window.playsOn) {
    // Each day: everyone with a game starts, best first, until the 10 spots are full.
    const games = new Map<RatedPlayer, number>();
    for (const day of window.days) {
      let spots = STARTERS;
      for (const p of ranked) {
        if (spots === 0) break;
        if (!window.playsOn(p.playerId, day)) continue;
        games.set(p, (games.get(p) ?? 0) + 1);
        spots--;
      }
    }
    return [...games].map(([p, g]) => ({ p, games: g }));
  }
  return ranked.flatMap((p, rank) => {
    const games = Math.min(window.gamesOf(p.playerId), left) * (window.rankWeights ? (window.rankWeights[rank] ?? 0) : 1);
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

export type SeasonReport = {
  expectedCats: number;
  categories: CategoryReport[];
  outlook: MatchupOutlook[];
  /** Every duo's average-week value per category, in CATS order, for a side-by-side table. */
  table: { duo: Duo; values: (number | null)[] }[];
};

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
  const table = duos.map((d) => ({ duo: d, values: CATS.map((cat) => catValue(totals.get(d.id)!, cat)) }));
  return { expectedCats: seasonExpectedCats(me.id, totals), categories, outlook, table };
}

export type CatLine = { cat: Category; mine: number | null; theirs: number | null; winChance: number };

export type Pickup = {
  add: RatedPlayer;
  addGames: number;
  /** Null when the manager has an open roster spot (e.g. someone moved to IR). */
  drop: RatedPlayer | null;
  dropFrom: string;
  /** Change in expected categories won this week against this week's opponent. */
  weekGain: number;
  /** Change in expected categories in an average week: the rest-of-season effect. */
  seasonGain: number;
  /** Helps this week but costs the rest of the season: drop him again after the week. */
  stream: boolean;
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

  // Pickups. Each manager makes his own moves, so each gets his own list. A manager
  // with an open roster spot just adds; otherwise each free agent replaces one of his
  // weakest few players. Ranked by this week's gain plus the rest-of-season gain, so a
  // one-week stream that hurts the season does not float to the top.
  const seasonTotals = allSeasonTotals(duos, rosters, rated);
  const seasonBefore = seasonExpectedCats(me.id, seasonTotals);
  const weekBefore = sum(chances);
  const pickups: Pickup[] = [];
  for (const team of [me.espnA, me.espnB]) {
    if (team === null) continue;
    const manager = team === me.espnA ? me.a : me.b;
    const roster = rosters[team] ?? [];
    const openSpot = roster.filter((p) => !p.ir).length < ROSTER_SIZE;
    const drops: (RosterPlayer | null)[] = openSpot
      ? [null]
      : roster
          .filter((p) => !p.ir && rated.has(p.id))
          .sort((a, b) => rated.get(a.id)!.value - rated.get(b.id)!.value)
          .slice(0, DROP_CANDIDATES);
    const options: Pickup[] = [];
    for (const id of freeAgents) {
      const add = rated.get(id);
      if (!add) continue;
      let best: { pickup: Pickup; score: number } | null = null;
      for (const drop of drops) {
        const incoming = { id, name: add.name };
        const changed = drop ? roster.map((p) => (p.id === drop.id ? incoming : p)) : [...roster, incoming];
        const swapped = { ...rosters, [team]: changed };
        const weekGain = sum(chancesVs(addLines(playedMine, duoTotals(me, swapped, rated, window)), theirs)) - weekBefore;
        const seasonMine = duoTotals(me, swapped, rated, AVERAGE_WEEK);
        const seasonGain = expectedVs(seasonMine, duos, me.id, me.id, seasonMine, seasonTotals) - seasonBefore;
        const score = weekGain + seasonGain;
        if (!best || score > best.score) {
          const pickup = { add, addGames: window.gamesOf(id), drop: drop ? rated.get(drop.id)! : null, dropFrom: manager, weekGain, seasonGain, stream: seasonGain < -STREAM_THRESHOLD };
          best = { pickup, score };
        }
      }
      if (best && best.score > 0) options.push(best.pickup);
    }
    options.sort((x, y) => y.weekGain + y.seasonGain - (x.weekGain + x.seasonGain));
    pickups.push(...options.slice(0, PICKUPS_PER_MANAGER));
  }

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
    pickups,
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

  // Speed: this runs ~200k times, so each team's players are sorted by value once and
  // a trade only merges the incoming players in. In an average week the lineup is
  // simply the top STARTERS players, each playing GAMES_PER_WEEK games.
  const ranked = new Map<number, RatedPlayer[]>();
  for (const team of owner.keys()) {
    ranked.set(team, (rosters[team] ?? []).filter((p) => !p.ir).flatMap((p) => rated.get(p.id) ?? []).sort((a, b) => b.value - a.value));
  }
  const managerTotals = new Map([...ranked].map(([team, list]) => [team, topTotals(list, new Set(), [])]));
  const duoOf = (d: Duo, swaps: Map<number, StatLine>) => {
    const out = emptyLine();
    for (const team of [d.espnA, d.espnB]) {
      if (team === null) continue;
      const t = swaps.get(team) ?? managerTotals.get(team)!;
      for (const f of FIELDS) out[f] += t[f];
    }
    return out;
  };
  const tradeable = (team: number) =>
    packages(ranked.get(team)!).map((ps) => ({
      players: [...ps].sort((a, b) => b.value - a.value),
      ids: new Set(ps.map((p) => p.playerId)),
      value: packageValue(ps.map((p) => tradeValue(meta.get(p.playerId)))),
    }));

  const ideas: TradeIdea[] = [];
  for (const myTeam of myTeams) {
    const mine = tradeable(myTeam);
    for (const theirTeam of [...owner.keys()].filter((t) => !myTeams.includes(t))) {
      const partner = owner.get(theirTeam)!.duo;
      const theirBefore = seasonExpectedCats(partner.id, totals);
      // Sorted by value so each package of mine only scans the balanced window of theirs.
      const theirs = tradeable(theirTeam).sort((a, b) => a.value - b.value);
      for (const g of mine) {
        for (const t of theirs) {
          if (t.value > g.value && !balanced(g.value, t.value)) break;
          if (!balanced(g.value, t.value)) continue;
          const [ng, nt] = [g.players.length, t.players.length];
          if (Math.abs(ng - nt) > 1 || (ng === MAX_SIDE && nt === MAX_SIDE)) continue;
          const swaps = new Map([
            [myTeam, topTotals(ranked.get(myTeam)!, g.ids, t.players)],
            [theirTeam, topTotals(ranked.get(theirTeam)!, t.ids, g.players)],
          ]);
          const myNew = duoOf(me, swaps);
          const partnerNew = duoOf(partner, swaps);
          const myGain = expectedVs(myNew, duos, me.id, partner.id, partnerNew, totals) - myBefore;
          if (myGain < MIN_GAIN) continue;
          const theirGain = expectedVs(partnerNew, duos, partner.id, me.id, myNew, totals) - theirBefore;
          if (theirGain < -FAIR_TOLERANCE) continue;
          ideas.push({
            give: g.players, giveFrom: owner.get(myTeam)!.name,
            get: t.players, getFrom: owner.get(theirTeam)!.name,
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
  const picked = ideas
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
    });
  // Both managers trade, so each gets his own share of the list.
  const myManagers = myTeams.map((t) => owner.get(t)!.name);
  return myManagers.flatMap((name) => picked.filter((i) => i.giveFrom === name).slice(0, TRADES_PER_MANAGER));
}

/**
 * Expected categories per week for one duo against everyone else, where one other duo
 * has new totals. Same as seasonExpectedCats without copying the totals map, which
 * matters inside the trade loop.
 */
function expectedVs(mine: StatLine, duos: Duo[], selfId: string, changedId: string, changed: StatLine, totals: Map<string, StatLine>): number {
  let total = 0;
  let n = 0;
  for (const d of duos) {
    if (d.id === selfId) continue;
    const opp = d.id === changedId ? changed : totals.get(d.id)!;
    for (const cat of CATS) total += catWinChance(mine, opp, cat);
    n++;
  }
  return total / (n || 1);
}

/**
 * Average-week totals for a manager's players (depth-weighted, as in AVERAGE_WEEK),
 * after removing the ids in `out` and adding `incoming`. Both lists are sorted best
 * first, so this is a merge instead of a re-sort.
 */
function topTotals(sorted: RatedPlayer[], out: Set<number>, incoming: RatedPlayer[]): StatLine {
  const total = emptyLine();
  let i = 0;
  let j = 0;
  let taken = 0;
  while (taken < DEPTH_WEIGHTS.length && (i < sorted.length || j < incoming.length)) {
    let next: RatedPlayer;
    if (i < sorted.length && out.has(sorted[i].playerId)) {
      i++;
      continue;
    }
    if (j >= incoming.length || (i < sorted.length && sorted[i].value >= incoming[j].value)) next = sorted[i++];
    else next = incoming[j++];
    const games = GAMES_PER_WEEK * DEPTH_WEIGHTS[taken];
    for (const f of FIELDS) total[f] += next.perGame[f] * games;
    taken++;
  }
  return total;
}

/**
 * What dropping each of my active players would cost, in expected categories per
 * average week over the rest of the season (bench depth counted). Lowest = best drop.
 */
export function dropCosts(duos: Duo[], rosters: TeamRosters, rated: Map<number, RatedPlayer>, me: Duo): Map<number, number> {
  const totals = allSeasonTotals(duos, rosters, rated);
  const before = seasonExpectedCats(me.id, totals);
  const costs = new Map<number, number>();
  for (const team of [me.espnA, me.espnB]) {
    if (team === null) continue;
    for (const p of rosters[team] ?? []) {
      if (p.ir || !rated.has(p.id)) continue;
      const without = { ...rosters, [team]: rosters[team].filter((x) => x.id !== p.id) };
      const mine = duoTotals(me, without, rated, AVERAGE_WEEK);
      costs.set(p.id, before - expectedVs(mine, duos, me.id, me.id, mine, totals));
    }
  }
  return costs;
}
