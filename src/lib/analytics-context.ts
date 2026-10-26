import "server-only";
import { loadLeagueState, readConfig } from "@/lib/league";
import { loadAnalyticsData, type AnalyticsData } from "@/lib/projections";
import { lineupCap, ratePlayers, type GameWindow, type PlayerMeta, type RatedPlayer, type TeamRosters } from "@/lib/analytics";
import { gamesForWeek } from "@/lib/playoffs";
import { emptyLine, FIELDS, memberKeys } from "@/lib/scoring";
import { SEASON_START, weekBounds, weekFromDate } from "@/lib/season";
import type { Duo, LeagueState, StatLine } from "@/types/league";

/** The analytics pages are Stanley's: they always analyze the duo he is in. */
export const ME = "Stanley";
const MS_PER_DAY = 86_400_000;

/** ESPN game day (1 = opening night) for a timestamp. */
const dayOf = (ms: number) => Math.floor((ms - SEASON_START) / MS_PER_DAY) + 1;

/** Today's ESPN game day. */
export const gameDayToday = () => dayOf(Date.now());

export type DataInfo = { sources: string[]; updatedAt: string | null; playerCount: number; gamesPlayed: number };

export type AnalyticsContext = {
  state: LeagueState;
  me: Duo;
  info: DataInfo;
  /** Null until projections are stored and ESPN rosters have synced. */
  ready: {
    rated: Map<number, RatedPlayer>;
    rosters: TeamRosters;
    meta: Map<number, PlayerMeta>;
    gameDays: Map<number, Set<number>>;
    games: AnalyticsData["games"];
    abbrevs: Map<number, string>;
    freeAgents: number[];
  } | null;
};

/** Everything both analytics screens read, loaded once per request. */
export async function loadAnalyticsContext(): Promise<AnalyticsContext> {
  const [state, { espnCache }, data] = await Promise.all([loadLeagueState({ sync: false }), readConfig(), loadAnalyticsData()]);
  const me = state.config.duos.find((d) => d.a === ME || d.b === ME) ?? state.config.duos[0];
  const info = {
    sources: data.sources,
    updatedAt: data.updatedAt?.toISOString() ?? null,
    playerCount: data.players.length,
    gamesPlayed: data.players.reduce((n, p) => Math.max(n, p.actual?.gp ?? 0), 0),
  };
  const rosters = espnCache?.rosters;
  if (!data.players.length || !rosters) return { state, me, info, ready: null };
  const rostered = new Set(Object.values(rosters).flat().map((p) => p.id));
  const freeAgents = [...data.meta.entries()].filter(([id, m]) => m.onTeamId === null && !rostered.has(id)).map(([id]) => id);
  return { state, me, info, ready: { rated: ratePlayers(data.players), rosters, meta: data.meta, gameDays: data.gameDays, games: data.games, abbrevs: data.abbrevs, freeAgents } };
}

/** The weeks that can be opened: this one and the next, as long as the season has them. */
/**
 * This week and next, from the calendar (an admin override still wins). Not ESPN's
 * current week: on Monday morning ESPN can still report last week as current.
 */
export function openWeeks(state: LeagueState, now = Date.now()): number[] {
  const thisWeek = state.config.currentWeekOverride ?? weekFromDate(now, state.config.weeks);
  return [thisWeek, thisWeek + 1].filter((w) => w <= state.config.weeks);
}

/** My game in a week (regular season or bracket) and its label, if I have one. */
export function myGame(state: LeagueState, me: Duo, week: number): { opponent: Duo; label: string } | null {
  const game = gamesForWeek(state, week).find((g) => g.a?.id === me.id || g.b?.id === me.id);
  const opponent = game ? (game.a?.id === me.id ? game.b : game.a) : null;
  return game && opponent ? { opponent, label: game.label } : null;
}

/**
 * Games each player has left in a week. Before the week starts that is the whole
 * week; during it, only days after today, because today's games are already in
 * ESPN's live totals. Players listed OUT are counted for zero. With `full`, every
 * day of the week counts, as if it had not started (what the saved week moves use).
 */
export function weekWindow(
  week: number,
  meta: Map<number, PlayerMeta>,
  gameDays: Map<number, Set<number>>,
  { full = false }: { full?: boolean } = {},
): { window: GameWindow; started: boolean } {
  const [start, end] = weekBounds(week);
  const first = dayOf(start);
  const last = dayOf(end);
  const today = dayOf(Date.now());
  const started = today >= first;
  const from = started && !full ? today + 1 : first;
  const days = Array.from({ length: Math.max(0, last - from + 1) }, (_, i) => from + i);
  const playsOn = (playerId: number, day: number) => {
    const m = meta.get(playerId);
    return !!m && m.injuryStatus !== "OUT" && !!gameDays.get(m.proTeamId)?.has(day);
  };
  const gamesOf = (playerId: number) => days.filter((d) => playsOn(playerId, d)).length;
  // Day by day: each manager's lineup is set daily, so each day's 10 spots are simulated.
  return { window: { gamesOf, cap: lineupCap(days.length), days, playsOn }, started };
}

/** A duo's stats already played this week, from ESPN's live team totals. */
export function played(state: LeagueState, week: number, duo: Duo): StatLine {
  const out = emptyLine();
  for (const key of memberKeys(duo)) {
    const line = state.scores[week]?.[key];
    if (line) for (const f of FIELDS) out[f] += line[f];
  }
  return out;
}
