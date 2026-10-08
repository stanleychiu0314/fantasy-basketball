import type { StatField, StatLine } from "@/types/league";
import { ESPN_LEAGUE_ID, ESPN_SEASON } from "@/lib/season";
import { emptyLine } from "@/lib/scoring";

/**
 * ESPN has no official fantasy API. This is the same JSON endpoint the ESPN
 * fantasy website reads from. It works without login because the league is
 * set to "viewable to public". If ESPN changes it, the admin page still
 * allows manual entry.
 */
const BASE = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${ESPN_SEASON}/segments/0/leagues/${ESPN_LEAGUE_ID}`;
const VIEWS = ["mTeam", "mRoster", "mMatchupScore", "mScoreboard", "mSettings", "mStatus"];
const REQUEST_TIMEOUT_MS = 8_000;

/** ESPN stat ids for basketball. */
const STAT_IDS: Record<StatField, number> = {
  pts: 0,
  blk: 1,
  stl: 2,
  ast: 3,
  reb: 6,
  to: 11,
  fgm: 13,
  fga: 14,
  ftm: 15,
  fta: 16,
  tpm: 17,
};

type EspnSide = {
  teamId: number;
  cumulativeScore?: { scoreByStat?: Record<string, { score: number }> };
};

type EspnLeague = {
  status?: { currentMatchupPeriod?: number };
  settings?: { name?: string; scheduleSettings?: { matchupPeriods?: Record<string, number[]> } };
  members?: { id: string; displayName?: string; firstName?: string; lastName?: string }[];
  teams?: {
    id: number;
    name?: string;
    location?: string;
    nickname?: string;
    owners?: string[];
    roster?: { entries?: { playerPoolEntry?: { player?: { fullName?: string } } }[] };
  }[];
  schedule?: { matchupPeriodId: number; home?: EspnSide; away?: EspnSide }[];
};

export type EspnSnapshot = {
  currentMatchupPeriod: number;
  teams: { id: number; name: string; owner: string }[];
  rosters: Record<number, string[]>;
  /** week -> teamId -> stats. Only one-week matchup periods, where ESPN has posted stats. */
  stats: Record<number, Record<number, StatLine>>;
  /** The week ESPN is currently playing, or null when its current period spans several weeks. */
  currentWeek: number | null;
};

export type EspnResult = { status: "ok"; data: EspnSnapshot } | { status: "private" | "error"; message: string };

/** Pull the league from ESPN and reshape it into what this site needs. */
export async function fetchEspn(): Promise<EspnResult> {
  const url = `${BASE}?${VIEWS.map((v) => `view=${v}`).join("&")}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  // Only needed if the league is ever switched back to private.
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) {
    headers.Cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  }
  try {
    const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.status === 401) return { status: "private", message: "ESPN says the league is not viewable to the public." };
    if (!res.ok) return { status: "error", message: `ESPN returned ${res.status}` };
    return { status: "ok", data: parseLeague((await res.json()) as EspnLeague) };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "ESPN request failed" };
  }
}

/** Convert ESPN's raw league JSON into team names, rosters and weekly stat lines. */
export function parseLeague(raw: EspnLeague): EspnSnapshot {
  const memberName = new Map(
    (raw.members ?? []).map((m) => [m.id, [m.firstName, m.lastName].filter(Boolean).join(" ") || m.displayName || ""]),
  );
  const teams = (raw.teams ?? []).map((t) => ({
    id: t.id,
    name: t.name || [t.location, t.nickname].filter(Boolean).join(" ") || `Team ${t.id}`,
    owner: memberName.get(t.owners?.[0] ?? "") ?? "",
  }));
  const rosters: Record<number, string[]> = {};
  for (const t of raw.teams ?? []) {
    rosters[t.id] = (t.roster?.entries ?? [])
      .map((e) => e.playerPoolEntry?.player?.fullName ?? "")
      .filter(Boolean);
  }
  // ESPN playoff rounds can span two weeks. Those cannot be split into weekly
  // duo matchups, so only one-week periods are mapped to a week.
  const periodWeeks = raw.settings?.scheduleSettings?.matchupPeriods ?? {};
  const weekOf = (period: number): number | null => {
    const weeks = periodWeeks[String(period)];
    if (!weeks) return period;
    return weeks.length === 1 ? weeks[0] : null;
  };
  const stats: Record<number, Record<number, StatLine>> = {};
  for (const m of raw.schedule ?? []) {
    const week = weekOf(m.matchupPeriodId);
    if (week === null) continue;
    for (const side of [m.home, m.away]) {
      const byStat = side?.cumulativeScore?.scoreByStat;
      if (!side || !byStat || Object.keys(byStat).length === 0) continue;
      const line = emptyLine();
      for (const [field, id] of Object.entries(STAT_IDS) as [StatField, number][]) {
        line[field] = byStat[String(id)]?.score ?? 0;
      }
      (stats[week] ??= {})[side.teamId] = line;
    }
  }
  const currentMatchupPeriod = raw.status?.currentMatchupPeriod ?? 1;
  return { currentMatchupPeriod, currentWeek: weekOf(currentMatchupPeriod), teams, rosters, stats };
}
