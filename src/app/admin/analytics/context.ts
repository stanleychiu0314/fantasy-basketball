import "server-only";
import { loadLeagueState, readConfig } from "@/lib/league";
import { loadAnalyticsData } from "@/lib/projections";
import { lineupCap, ratePlayers, tradeIdeas, type GameWindow, type PlayerMeta, type RatedPlayer, type TeamRosters, type TradeIdea } from "@/lib/analytics";
import { gamesForWeek } from "@/lib/playoffs";
import { emptyLine, FIELDS, memberKeys } from "@/lib/scoring";
import { SEASON_START, weekBounds } from "@/lib/season";
import type { Duo, LeagueState, StatLine } from "@/types/league";

/** The analytics pages are Stanley's: they always analyze the duo he is in. */
const ME = "Stanley";
const MS_PER_DAY = 86_400_000;

/** ESPN game day (1 = opening night) for a timestamp. */
const dayOf = (ms: number) => Math.floor((ms - SEASON_START) / MS_PER_DAY) + 1;

export type DataInfo = { sources: string[]; updatedAt: string | null; playerCount: number; gamesPlayed: number };

export type AnalyticsContext = {
  state: LeagueState;
  me: Duo;
  info: DataInfo;
  /** Null until projections are stored and ESPN rosters have synced. */
  ready: { rated: Map<number, RatedPlayer>; rosters: TeamRosters; meta: Map<number, PlayerMeta>; gameDays: Map<number, Set<number>>; freeAgents: number[] } | null;
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
  return { state, me, info, ready: { rated: ratePlayers(data.players), rosters, meta: data.meta, gameDays: data.gameDays, freeAgents } };
}

/**
 * Trades only change when rosters, duos or projections change, so the slow search
 * runs once per version of that data and reloads reuse it.
 * shortcut: in-memory, so each new server instance pays the search once; move to the database if that bites.
 */
let tradeCache: { key: string; ideas: TradeIdea[] } | null = null;

export function cachedTradeIdeas(ctx: AnalyticsContext): TradeIdea[] {
  const { ready, state, me, info } = ctx;
  if (!ready) return [];
  const key = JSON.stringify([info.updatedAt, ready.rosters, state.config.duos]);
  if (tradeCache?.key !== key) {
    tradeCache = { key, ideas: tradeIdeas(state.config.duos, ready.rosters, ready.rated, ready.meta, me) };
  }
  return tradeCache.ideas;
}

/** The weeks that can be opened: this one and the next, as long as the season has them. */
export const openWeeks = (state: LeagueState) => [state.currentWeek, state.currentWeek + 1].filter((w) => w <= state.config.weeks);

/** My game in a week (regular season or bracket) and its label, if I have one. */
export function myGame(state: LeagueState, me: Duo, week: number): { opponent: Duo; label: string } | null {
  const game = gamesForWeek(state, week).find((g) => g.a?.id === me.id || g.b?.id === me.id);
  const opponent = game ? (game.a?.id === me.id ? game.b : game.a) : null;
  return game && opponent ? { opponent, label: game.label } : null;
}

/**
 * Games each player has left in a week. Before the week starts that is the whole
 * week; during it, only days after today, because today's games are already in
 * ESPN's live totals. Players listed OUT are counted for zero.
 */
export function weekWindow(week: number, meta: Map<number, PlayerMeta>, gameDays: Map<number, Set<number>>): { window: GameWindow; started: boolean } {
  const [start, end] = weekBounds(week);
  const first = dayOf(start);
  const last = dayOf(end);
  const today = dayOf(Date.now());
  const started = today >= first;
  const from = started ? today + 1 : first;
  const gamesOf = (playerId: number) => {
    const m = meta.get(playerId);
    if (!m || m.injuryStatus === "OUT") return 0;
    const schedule = gameDays.get(m.proTeamId);
    let n = 0;
    for (let d = from; d <= last; d++) if (schedule?.has(d)) n++;
    return n;
  };
  return { window: { gamesOf, cap: lineupCap(Math.max(0, last - from + 1)) }, started };
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
