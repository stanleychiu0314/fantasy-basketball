import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { loadLeagueState, readConfig } from "@/lib/league";
import { loadAnalyticsData } from "@/lib/projections";
import { lineupCap, ratePlayers, seasonReport, tradeIdeas, weekReport, type GameWindow, type PlayerMeta } from "@/lib/analytics";
import { gamesForWeek } from "@/lib/playoffs";
import { emptyLine, FIELDS, memberKeys } from "@/lib/scoring";
import { SEASON_START, weekBounds } from "@/lib/season";
import type { Duo, LeagueState, StatLine } from "@/types/league";
import { AnalyticsView } from "@/components/admin/AnalyticsView";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners analytics", robots: { index: false } };

/** This page is Stanley's: it always analyzes the duo he is in. */
const ME = "Stanley";
const MS_PER_DAY = 86_400_000;
const STARTERS = 10;

/** ESPN game day (1 = opening night) for a timestamp. */
const dayOf = (ms: number) => Math.floor((ms - SEASON_START) / MS_PER_DAY) + 1;

/**
 * Games each player has left in a week. Before the week starts that is the whole
 * week; during it, only days after today, because today's games are already in
 * ESPN's live totals. Players listed OUT are counted for zero.
 */
function weekWindow(week: number, meta: Map<number, PlayerMeta>, gameDays: Map<number, Set<number>>): { window: GameWindow; started: boolean } {
  const [start, end] = weekBounds(week);
  const first = dayOf(start);
  const last = dayOf(end);
  const today = dayOf(Date.now());
  const started = today >= first;
  const from = started ? today + 1 : first;
  const days = Math.max(0, last - from + 1);
  const gamesOf = (playerId: number) => {
    const m = meta.get(playerId);
    if (!m || m.injuryStatus === "OUT") return 0;
    const schedule = gameDays.get(m.proTeamId);
    let n = 0;
    for (let d = from; d <= last; d++) if (schedule?.has(d)) n++;
    return n;
  };
  return { window: { gamesOf, cap: lineupCap(days) }, started };
}

/** A duo's stats already played this week, from ESPN's live team totals. */
function played(state: LeagueState, week: number, duo: Duo): StatLine {
  const out = emptyLine();
  for (const key of memberKeys(duo)) {
    const line = state.scores[week]?.[key];
    if (line) for (const f of FIELDS) out[f] += line[f];
  }
  return out;
}

// Next.js requires a default export for pages.
export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  if (!(await isAdmin())) return <LoginForm />;
  const [state, { espnCache }, data, params] = await Promise.all([loadLeagueState(), readConfig(), loadAnalyticsData(), searchParams]);
  const { config } = state;
  const me = config.duos.find((d) => d.a === ME || d.b === ME) ?? config.duos[0];
  const requested = Number(params.week);
  const week = Number.isInteger(requested) && requested >= 1 && requested <= config.weeks ? requested : state.currentWeek;
  const rosters = espnCache?.rosters;

  const header = { me, week, weeks: config.weeks, regularWeeks: config.regularWeeks, currentWeek: state.currentWeek, final: state.final };
  const dataInfo = {
    sources: data.sources,
    updatedAt: data.updatedAt?.toISOString() ?? null,
    playerCount: data.players.length,
    gamesPlayed: data.players.reduce((n, p) => Math.max(n, p.actual?.gp ?? 0), 0),
  };
  if (!data.players.length || !rosters) return <AnalyticsView header={header} data={dataInfo} analysis={null} />;

  const rated = ratePlayers(data.players);
  const rostered = new Set(Object.values(rosters).flat().map((p) => p.id));
  const freeAgents = [...data.meta.entries()].filter(([id, m]) => m.onTeamId === null && !rostered.has(id)).map(([id]) => id);

  const game = gamesForWeek(state, week).find((g) => g.a?.id === me.id || g.b?.id === me.id);
  const opponent = game ? (game.a?.id === me.id ? game.b : game.a) : null;
  const { window, started } = weekWindow(week, data.meta, data.gameDays);
  const weekly = opponent
    ? weekReport({
        duos: config.duos, rosters, rated, me, opponent, window, freeAgents,
        playedMine: started ? played(state, week, me) : emptyLine(),
        playedTheirs: started ? played(state, week, opponent) : emptyLine(),
      })
    : null;

  const roster = (["a", "b"] as const).flatMap((side) => {
    const team = side === "a" ? me.espnA : me.espnB;
    if (team === null) return [];
    const players = (rosters[team] ?? []).flatMap((p) => {
      const r = rated.get(p.id);
      return r ? [{ player: r, manager: me[side], ir: !!p.ir, injury: data.meta.get(p.id)?.injuryStatus ?? "ACTIVE", games: window.gamesOf(p.id) }] : [];
    });
    const starters = new Set(players.filter((p) => !p.ir).sort((x, y) => y.player.value - x.player.value).slice(0, STARTERS).map((p) => p.player.playerId));
    return players.map((p) => ({ ...p, starter: starters.has(p.player.playerId) }));
  });

  return (
    <AnalyticsView
      header={header}
      data={dataInfo}
      analysis={{
        weekly,
        weekLabel: game?.label ?? "",
        started,
        season: seasonReport(config.duos, rosters, rated, me),
        trades: tradeIdeas(config.duos, rosters, rated, data.meta, me),
        roster,
      }}
    />
  );
}
