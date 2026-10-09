import type { Duo, LeagueState, StatField, StatLine } from "@/types/league";

export const FIELDS: StatField[] = ["fgm", "fga", "ftm", "fta", "tpm", "reb", "ast", "stl", "blk", "to", "pts"];

export const FIELD_LABEL: Record<StatField, string> = {
  fgm: "FGM",
  fga: "FGA",
  ftm: "FTM",
  fta: "FTA",
  tpm: "3PM",
  reb: "REB",
  ast: "AST",
  stl: "STL",
  blk: "BLK",
  to: "TO",
  pts: "PTS",
};

export type Category = {
  key: string;
  label: string;
  name: string;
  how: string;
  /** Lower is better (turnovers). */
  low: boolean;
  /** For percentage categories: [made, attempted]. */
  pct?: [StatField, StatField];
  field?: StatField;
};

export const CATS: Category[] = [
  { key: "pts", label: "PTS", name: "Points", how: "Total points", low: false, field: "pts" },
  { key: "fg", label: "FG%", name: "Field goal percentage", how: "Total made shots divided by total attempts", low: false, pct: ["fgm", "fga"] },
  { key: "ft", label: "FT%", name: "Free throw percentage", how: "Total made free throws divided by total attempts", low: false, pct: ["ftm", "fta"] },
  { key: "tpm", label: "3PM", name: "Three-pointers made", how: "Total threes made", low: false, field: "tpm" },
  { key: "reb", label: "REB", name: "Rebounds", how: "Total rebounds", low: false, field: "reb" },
  { key: "ast", label: "AST", name: "Assists", how: "Total assists", low: false, field: "ast" },
  { key: "stl", label: "STL", name: "Steals", how: "Total steals", low: false, field: "stl" },
  { key: "blk", label: "BLK", name: "Blocks", how: "Total blocks", low: false, field: "blk" },
  { key: "to", label: "TO", name: "Turnovers", how: "Total turnovers. Fewer is better", low: true, field: "to" },
];

/** Floating point slack when comparing two percentages for a tie. */
const TIE_EPSILON = 1e-12;
const DUO_COUNT = 6;
const ROUND_ROBIN_ROUNDS = DUO_COUNT - 1;

export type Aggregate = StatLine & { any: boolean };

export type CatResult = { cat: Category; a: number | null; b: number | null; winner: 1 | -1 | 0 | null };

export type MatchupResult = {
  played: boolean;
  partial: boolean;
  winsA: number;
  winsB: number;
  ties: number;
  cats: CatResult[];
};

export type StandingRow = {
  duo: Duo;
  w: number;
  l: number;
  t: number;
  catW: number;
  catL: number;
  catT: number;
  played: number;
  results: ("W" | "L" | "T")[];
  catWins: Record<string, number>;
  pct: number;
  rank: number;
};

export const memberKeys = (d: Duo): [string, string] => [`${d.id}a`, `${d.id}b`];

export const emptyLine = (): StatLine =>
  FIELDS.reduce((acc, f) => ({ ...acc, [f]: 0 }), {} as StatLine);

/**
 * Circle-method round robin for six duos. Every duo meets every other duo once
 * per five weeks, then the cycle repeats.
 */
export function defaultPairs(week: number, duoIds: string[]): [string, string][] {
  let order = [0, 1, 2, 3, 4, 5];
  const round = (week - 1) % ROUND_ROBIN_ROUNDS;
  for (let i = 0; i < round; i++) order = [order[0], order[5], order[1], order[2], order[3], order[4]];
  const raw: [number, number][] = [
    [order[0], order[5]],
    [order[1], order[4]],
    [order[2], order[3]],
  ];
  return raw.map(([x, y]) => [duoIds[x], duoIds[y]]);
}

export function pairsFor(state: Pick<LeagueState, "config">, week: number): [string, string][] {
  return state.config.schedule[String(week)] ?? defaultPairs(week, state.config.duos.map((d) => d.id));
}

/** Sum both managers' rosters into one duo line. */
export function aggregate(scores: LeagueState["scores"], week: number, duo: Duo): Aggregate {
  const out: Aggregate = { ...emptyLine(), any: false };
  for (const key of memberKeys(duo)) {
    const line = scores[week]?.[key];
    if (!line) continue;
    for (const f of FIELDS) {
      const v = line[f];
      if (typeof v !== "number" || Number.isNaN(v)) continue;
      out[f] += v;
      out.any = true;
    }
  }
  return out;
}

export function catValue(agg: StatLine, cat: Category): number | null {
  if (cat.pct) {
    const [made, att] = cat.pct;
    return agg[att] > 0 ? agg[made] / agg[att] : null;
  }
  return cat.field ? agg[cat.field] : null;
}

/** Compare two duos across all nine categories for one week. */
export function matchup(scores: LeagueState["scores"], week: number, A: Duo, B: Duo): MatchupResult {
  const a = aggregate(scores, week, A);
  const b = aggregate(scores, week, B);
  const played = a.any && b.any;
  const result: MatchupResult = { played, partial: a.any !== b.any, winsA: 0, winsB: 0, ties: 0, cats: [] };
  for (const cat of CATS) {
    const va = catValue(a, cat);
    const vb = catValue(b, cat);
    let winner: CatResult["winner"] = null;
    if (played && va !== null && vb !== null) {
      const diff = cat.low ? vb - va : va - vb;
      winner = Math.abs(diff) < TIE_EPSILON ? 0 : diff > 0 ? 1 : -1;
      if (winner === 1) result.winsA++;
      else if (winner === -1) result.winsB++;
      else result.ties++;
    }
    result.cats.push({ cat, a: va, b: vb, winner });
  }
  return result;
}

/**
 * Regular-season table: matchup record first, then category record, then raw category wins.
 * Pass maxWeek to see the table as it stood after that week (for rank movement arrows).
 */
export function computeStandings(state: Pick<LeagueState, "config" | "scores">, maxWeek?: number) {
  const { config, scores } = state;
  const rows = new Map<string, StandingRow>();
  for (const duo of config.duos) {
    rows.set(duo.id, {
      duo, w: 0, l: 0, t: 0, catW: 0, catL: 0, catT: 0, played: 0, results: [],
      catWins: Object.fromEntries(CATS.map((c) => [c.key, 0])), pct: 0, rank: 0,
    });
  }
  const byId = new Map(config.duos.map((d) => [d.id, d]));
  let lastPlayed = 0;
  // Only the regular season counts toward the table; playoffs are a bracket.
  const limit = Math.min(config.regularWeeks, maxWeek ?? config.regularWeeks);

  for (let week = 1; week <= limit; week++) {
    for (const [ia, ib] of pairsFor(state, week)) {
      const A = byId.get(ia);
      const B = byId.get(ib);
      if (!A || !B || A === B) continue;
      const m = matchup(scores, week, A, B);
      if (!m.played) continue;
      lastPlayed = week;
      const sides: [Duo, number, number][] = [[A, m.winsA, m.winsB], [B, m.winsB, m.winsA]];
      for (const [duo, mine, theirs] of sides) {
        const r = rows.get(duo.id)!;
        r.played++;
        r.catW += mine;
        r.catL += theirs;
        r.catT += m.ties;
        const outcome = mine > theirs ? "W" : mine < theirs ? "L" : "T";
        if (outcome === "W") r.w++;
        else if (outcome === "L") r.l++;
        else r.t++;
        r.results.push(outcome);
      }
      for (const c of m.cats) {
        if (c.winner === 1) rows.get(A.id)!.catWins[c.cat.key]++;
        if (c.winner === -1) rows.get(B.id)!.catWins[c.cat.key]++;
      }
    }
  }

  const points = (r: StandingRow) => r.w + 0.5 * r.t;
  const catPoints = (r: StandingRow) => r.catW + 0.5 * r.catT;
  const list = [...rows.values()];
  for (const r of list) r.pct = r.played ? points(r) / r.played : 0;
  list.sort(
    (x, y) => points(y) - points(x) || catPoints(y) - catPoints(x) || y.catW - x.catW || x.duo.name.localeCompare(y.duo.name),
  );
  list.forEach((r, i) => (r.rank = i + 1));
  return { rows: list, lastPlayed };
}

export function formatValue(cat: Category, v: number | null): string {
  if (v === null) return "–";
  if (cat.pct) return v.toFixed(3).replace(/^0/, "");
  return Math.round(v).toLocaleString("en-US");
}

/** Subtitle under a duo name. Empty when the duo is still named after its managers. */
export function duoSubtitle(d: Duo): string {
  return d.name === `${d.a} & ${d.b}` ? "" : `${d.a} + ${d.b}`;
}

export type Standings = ReturnType<typeof computeStandings>;
