import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tradeIdeas, weekReport, type TradeIdea } from "@/lib/analytics";
import { loadAnalyticsContext, myGame, type AnalyticsContext } from "@/lib/analytics-context";
import { fetchNbaDefense } from "@/lib/espn";
import { refreshNbaSchedule } from "@/lib/projections";
import { emptyLine } from "@/lib/scoring";
import { filterStillAvailable, streamingIncomplete, TRADES_KEY, weekMovesKey, type WeekMoves } from "@/lib/snapshot-rules";
import { buildStreaming, gamesByTeam, scheduleComplete } from "@/lib/streaming";
import { weekWindow } from "@/lib/week-view";

export type Snapshot<T> = { computedAt: Date; data: T };
export type SnapshotResult<T> = { ok: true; message: string; snapshot: Snapshot<T> } | { ok: false; message: string };

type Kind = (typeof schema.analyticsSnapshots.$inferSelect)["kind"];

/** A saved snapshot, or null when none is stored (or no database is connected). */
export async function readSnapshot<T>(key: string): Promise<Snapshot<T> | null> {
  if (!db) return null;
  const [row] = await db.select().from(schema.analyticsSnapshots).where(eq(schema.analyticsSnapshots.key, key)).limit(1);
  return row ? { computedAt: row.computedAt, data: row.data as T } : null;
}

/** Store (or replace) a snapshot. Without a database it is still returned, just not kept. */
async function save<T>(key: string, kind: Kind, week: number | null, data: T): Promise<Snapshot<T>> {
  const computedAt = new Date();
  if (db) {
    await db
      .insert(schema.analyticsSnapshots)
      .values({ key, kind, week, computedAt, data })
      .onConflictDoUpdate({ target: schema.analyticsSnapshots.key, set: { computedAt, data } });
  }
  return { computedAt, data };
}

/**
 * Pickups, categories to chase and streaming for Stanley's duo in one week, over the
 * whole week (every day counts, nothing played yet), so Monday's snapshot holds all week.
 */
export async function computeWeekMoves(week: number, ctx?: AnalyticsContext): Promise<SnapshotResult<WeekMoves>> {
  const { state, me, ready } = ctx ?? (await loadAnalyticsContext());
  if (!ready) return { ok: false, message: "Projections or ESPN rosters are not stored yet." };
  const game = myGame(state, me, week);
  if (!game) return { ok: false, message: `No game in week ${week}.` };
  const { rated, rosters, meta, gameDays, games, abbrevs, freeAgents } = ready;
  const { window } = weekWindow(week, meta, gameDays, { full: true });
  const report = weekReport({
    duos: state.config.duos, rosters, rated, me, opponent: game.opponent, window, freeAgents,
    playedMine: emptyLine(),
    playedTheirs: emptyLine(),
  });
  // Stored schedule rows without opponents (never refreshed since migration 0003) are refetched and saved first.
  const fresh = scheduleComplete(games, abbrevs) ? null : await refreshNbaSchedule();
  const defense = await fetchNbaDefense();
  // Without defense ranks every game would look neutral, which is misleading, so streaming is left out.
  const streaming = defense.status === "ok"
    ? buildStreaming({
        days: window.days ?? [],
        games: fresh ? gamesByTeam(fresh.games) : games,
        defenseRank: new Map([...defense.data].map(([id, d]) => [id, d.rank])),
        abbrevs: fresh?.abbrevs ?? abbrevs,
        rated, meta, freeAgents,
      })
    : null;
  const snapshot = await save(weekMovesKey(week), "week_moves", week, { pickups: report.pickups, targets: report.targets, streaming });
  return { ok: true, message: `Week ${week} moves saved${streaming ? "" : " (no defense data, streaming skipped)"}`, snapshot };
}

/** Trade ideas for Stanley's duo, saved under "trades". */
export async function computeTrades(ctx?: AnalyticsContext): Promise<SnapshotResult<TradeIdea[]>> {
  const { state, me, ready } = ctx ?? (await loadAnalyticsContext());
  if (!ready) return { ok: false, message: "Projections or ESPN rosters are not stored yet." };
  const ideas = tradeIdeas(state.config.duos, ready.rosters, ready.rated, ready.meta, me);
  return { ok: true, message: `${ideas.length} trade ideas saved`, snapshot: await save(TRADES_KEY, "trades", null, ideas) };
}

/**
 * A week's saved moves minus players rostered since. If none are saved yet (first
 * deploy, before any cron run), or the saved streaming was built from a schedule
 * without opponents, they are computed and stored now.
 */
export async function loadWeekMoves(week: number, ctx: AnalyticsContext): Promise<Snapshot<WeekMoves> | null> {
  const saved = await readSnapshot<WeekMoves>(weekMovesKey(week));
  const usable = saved && !streamingIncomplete(saved.data) ? saved : null;
  // A failed rebuild keeps the old snapshot rather than showing nothing.
  const snap = usable ?? (await computeWeekMoves(week, ctx).then((r) => (r.ok ? r.snapshot : saved)));
  return snap && { ...snap, data: filterStillAvailable(snap.data, ctx.ready?.rosters) };
}

/** Saved trade ideas, computed and stored now if none are saved yet. */
export async function loadTrades(ctx: AnalyticsContext): Promise<Snapshot<TradeIdea[]> | null> {
  const saved = await readSnapshot<TradeIdea[]>(TRADES_KEY);
  return saved ?? (await computeTrades(ctx).then((r) => (r.ok ? r.snapshot : null)));
}
