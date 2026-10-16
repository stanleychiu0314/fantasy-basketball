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
const LEAGUE_VIEWS = ["mTeam", "mRoster", "mMatchupScore", "mScoreboard", "mSettings", "mStatus"];
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

/** ESPN lineup slot ids. Bench and injured reserve stats do not count toward the team. */
const BENCH_SLOT = 12;
const IR_SLOT = 13;
const INACTIVE_SLOTS = new Set([BENCH_SLOT, IR_SLOT]);
/** ESPN stat entry markers: actual (not projected) stats for a single scoring period (day). */
const ACTUAL_STATS = 0;
const SINGLE_DAY_SPLIT = 5;

type EspnStatEntry = {
  scoringPeriodId?: number;
  statSourceId?: number;
  statSplitTypeId?: number;
  stats?: Record<string, number>;
};

type EspnRosterEntry = {
  playerId?: number;
  lineupSlotId?: number;
  playerPoolEntry?: { id?: number; player?: { id?: number; fullName?: string; stats?: EspnStatEntry[] } };
};

type EspnSide = {
  teamId: number;
  cumulativeScore?: { scoreByStat?: Record<string, { score: number }> };
};

type EspnTeam = {
  id: number;
  name?: string;
  location?: string;
  nickname?: string;
  owners?: string[];
  roster?: { entries?: EspnRosterEntry[] };
};

type EspnPoolPlayer = {
  onTeamId?: number;
  player?: {
    id?: number;
    fullName?: string;
    proTeamId?: number;
    injuryStatus?: string;
    ownership?: { averageDraftPosition?: number };
    stats?: (EspnStatEntry & { id?: string })[];
  };
};

export type EspnLeague = {
  players?: EspnPoolPlayer[];
  draftDetail?: { picks?: { overallPickNumber: number; playerId: number }[] };
  scoringPeriodId?: number;
  status?: { currentMatchupPeriod?: number; latestScoringPeriod?: number };
  settings?: { name?: string; scheduleSettings?: { matchupPeriods?: Record<string, number[]> } };
  members?: { id: string; displayName?: string; firstName?: string; lastName?: string }[];
  teams?: EspnTeam[];
  schedule?: { matchupPeriodId: number; home?: EspnSide; away?: EspnSide }[];
};

export type RosterPlayer = { id: number; name: string; ir?: boolean };

export type EspnSnapshot = {
  currentMatchupPeriod: number;
  /** The latest game day (ESPN "scoring period") that has started. */
  latestDay: number;
  teams: { id: number; name: string; owner: string }[];
  rosters: Record<number, RosterPlayer[]>;
  /** week -> teamId -> stats, for weeks where ESPN has posted stats. */
  stats: Record<number, Record<number, StatLine>>;
  /** The week ESPN is currently playing, or null when its current period spans several weeks. */
  currentWeek: number | null;
};

/** One player's line for one game day. */
export type PlayerDay = {
  day: number;
  playerId: number;
  name: string;
  teamId: number;
  lineupSlot: number;
  active: boolean;
  stats: StatLine;
};

export type EspnResult<T> = { status: "ok"; data: T } | { status: "private" | "error"; message: string };

/** GET an ESPN league URL, mapping auth and network failures to a status. */
async function getLeague(query: string, extraHeaders: Record<string, string> = {}): Promise<EspnResult<EspnLeague>> {
  const headers: Record<string, string> = { Accept: "application/json", ...extraHeaders };
  // Only needed if the league is ever switched back to private.
  if (process.env.ESPN_S2 && process.env.ESPN_SWID) {
    headers.Cookie = `espn_s2=${process.env.ESPN_S2}; SWID=${process.env.ESPN_SWID}`;
  }
  try {
    const res = await fetch(`${BASE}?${query}`, { headers, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.status === 401) return { status: "private", message: "ESPN says the league is not viewable to the public." };
    if (!res.ok) return { status: "error", message: `ESPN returned ${res.status}` };
    return { status: "ok", data: (await res.json()) as EspnLeague };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "ESPN request failed" };
  }
}

/** Pull the league from ESPN and reshape it into what this site needs. */
export async function fetchEspn(): Promise<EspnResult<EspnSnapshot>> {
  const r = await getLeague(LEAGUE_VIEWS.map((v) => `view=${v}`).join("&"));
  return r.status === "ok" ? { status: "ok", data: parseLeague(r.data) } : r;
}

/** Every rostered player's stats for one game day, with whether they were in the active lineup. */
export async function fetchDay(day: number): Promise<EspnResult<PlayerDay[]>> {
  const r = await getLeague(`view=mRoster&scoringPeriodId=${day}`);
  return r.status === "ok" ? { status: "ok", data: parseDay(r.data, day) } : r;
}

const toLine = (get: (id: number) => number | undefined): StatLine => {
  const line = emptyLine();
  for (const [field, id] of Object.entries(STAT_IDS) as [StatField, number][]) line[field] = get(id) ?? 0;
  return line;
};

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
  const rosters: Record<number, RosterPlayer[]> = {};
  for (const t of raw.teams ?? []) {
    rosters[t.id] = (t.roster?.entries ?? []).flatMap((e) => {
      const id = e.playerId ?? e.playerPoolEntry?.player?.id;
      const name = e.playerPoolEntry?.player?.fullName;
      return id !== undefined && name ? [{ id, name, ir: e.lineupSlotId === IR_SLOT }] : [];
    });
  }
  // Each ESPN matchup period maps to one ESPN week. If a period ever spans
  // several weeks (playoff rounds), it cannot be split, so it is skipped.
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
      (stats[week] ??= {})[side.teamId] = toLine((id) => byStat[String(id)]?.score);
    }
  }
  const currentMatchupPeriod = raw.status?.currentMatchupPeriod ?? 1;
  return {
    currentMatchupPeriod,
    latestDay: raw.status?.latestScoringPeriod ?? raw.scoringPeriodId ?? 1,
    currentWeek: weekOf(currentMatchupPeriod),
    teams,
    rosters,
    stats,
  };
}

/** Pull each rostered player's single-day actual stats out of a scoringPeriodId roster response. */
export function parseDay(raw: EspnLeague, day: number): PlayerDay[] {
  const out: PlayerDay[] = [];
  for (const team of raw.teams ?? []) {
    for (const e of team.roster?.entries ?? []) {
      const player = e.playerPoolEntry?.player;
      const playerId = e.playerId ?? player?.id;
      if (playerId === undefined || !player?.fullName) continue;
      const entry = player.stats?.find(
        (s) => s.scoringPeriodId === day && s.statSourceId === ACTUAL_STATS && s.statSplitTypeId === SINGLE_DAY_SPLIT,
      );
      // No entry means the player had no game that day.
      if (!entry?.stats) continue;
      const slot = e.lineupSlotId ?? -1;
      out.push({
        day,
        playerId,
        name: player.fullName,
        teamId: team.id,
        lineupSlot: slot,
        active: !INACTIVE_SLOTS.has(slot),
        stats: toLine((id) => entry.stats?.[String(id)]),
      });
    }
  }
  return out;
}

/** A season stat line plus games played. Totals, not per-game. */
export type SeasonLine = StatLine & { gp: number };

/** One player from ESPN's player pool, with his season projection and actual stats so far. */
export type PoolPlayer = {
  playerId: number;
  name: string;
  proTeamId: number;
  /** ESPN fantasy team that rosters him, or null for a free agent. */
  onTeamId: number | null;
  /** ESPN injury status, e.g. "ACTIVE", "DAY_TO_DAY", "OUT". */
  injuryStatus: string;
  /** Average draft position across ESPN leagues, or null if never drafted. */
  adp: number | null;
  projection: SeasonLine | null;
  actual: SeasonLine | null;
};

/** ESPN stat id for games played. */
const GAMES_PLAYED_STAT = 42;
/** ESPN keys season stat blocks as "<source><season>": 0 = actual, 1 = projected. */
const ACTUAL_SEASON_ID = `00${ESPN_SEASON}`;
const PROJECTED_SEASON_ID = `10${ESPN_SEASON}`;
/** Comfortably more than every NBA player; ESPN returns them in one response. */
const POOL_LIMIT = 2000;

/**
 * Every player's season projection and actual season totals. This is the JSON
 * ESPN's own projections page reads, so no HTML scraping or paging is needed.
 */
export async function fetchPlayerPool(): Promise<EspnResult<PoolPlayer[]>> {
  const filter = {
    players: {
      limit: POOL_LIMIT,
      offset: 0,
      sortPercOwned: { sortPriority: 1, sortAsc: false },
      filterStatsForTopScoringPeriodIds: { value: 2, additionalValue: [ACTUAL_SEASON_ID, PROJECTED_SEASON_ID] },
    },
  };
  const r = await getLeague("view=kona_player_info", { "x-fantasy-filter": JSON.stringify(filter) });
  return r.status === "ok" ? { status: "ok", data: parsePlayerPool(r.data) } : r;
}

/** Keep players that have a projection or actual stats; drop the rest of the pool. */
export function parsePlayerPool(raw: EspnLeague): PoolPlayer[] {
  const season = (stats: EspnStatEntry[] | undefined, id: string): SeasonLine | null => {
    const block = stats?.find((s) => (s as { id?: string }).id === id)?.stats;
    const gp = block?.[String(GAMES_PLAYED_STAT)] ?? 0;
    if (!block || gp <= 0) return null;
    return { ...toLine((statId) => block[String(statId)]), gp };
  };
  return (raw.players ?? []).flatMap((p) => {
    const pl = p.player;
    if (pl?.id === undefined || !pl.fullName) return [];
    const projection = season(pl.stats, PROJECTED_SEASON_ID);
    const actual = season(pl.stats, ACTUAL_SEASON_ID);
    if (!projection && !actual) return [];
    return [{
      playerId: pl.id,
      name: pl.fullName,
      proTeamId: pl.proTeamId ?? 0,
      onTeamId: p.onTeamId || null,
      injuryStatus: pl.injuryStatus ?? "ACTIVE",
      adp: pl.ownership?.averageDraftPosition || null,
      projection,
      actual,
    }];
  });
}

/** Overall pick number in this league's draft, by player id. */
export async function fetchDraftPicks(): Promise<EspnResult<Map<number, number>>> {
  const r = await getLeague("view=mDraftDetail");
  if (r.status !== "ok") return r;
  return { status: "ok", data: new Map((r.data.draftDetail?.picks ?? []).map((p) => [p.playerId, p.overallPickNumber])) };
}

type EspnProSchedule = { settings?: { proTeams?: { id: number; proGamesByScoringPeriod?: Record<string, unknown[]> }[] } };

/** Game days (ESPN scoring periods, day 1 = opening night) for every NBA team. */
export async function fetchNbaSchedule(): Promise<EspnResult<{ proTeamId: number; day: number }[]>> {
  try {
    const res = await fetch(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/${ESPN_SEASON}?view=proTeamSchedules_wl`, {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { status: "error", message: `ESPN schedule returned ${res.status}` };
    const raw = (await res.json()) as EspnProSchedule;
    const rows = (raw.settings?.proTeams ?? []).flatMap((t) =>
      Object.entries(t.proGamesByScoringPeriod ?? {})
        .filter(([, games]) => games.length > 0)
        .map(([day]) => ({ proTeamId: t.id, day: Number(day) })),
    );
    return { status: "ok", data: rows };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "ESPN schedule request failed" };
  }
}
