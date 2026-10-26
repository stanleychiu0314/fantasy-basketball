import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fetchDraftPicks, fetchNbaSchedule, fetchPlayerPool } from "@/lib/espn";
import type { PlayerInput, PlayerMeta } from "@/lib/analytics";

const ESPN_PROJECTION = "espn";
const ESPN_ACTUAL = "espn-actual";

/**
 * Pull every player's ESPN season projection, actual stats so far, roster status,
 * injury and draft slot, plus the NBA schedule, and store it all. Re-running it is
 * how projections get refined: actual games pile up and the blend leans on them more.
 */
export async function refreshProjections(): Promise<{ ok: boolean; message: string }> {
  if (!db) return { ok: false, message: "No database connected" };
  const [pool, picks, schedule] = await Promise.all([fetchPlayerPool(), fetchDraftPicks(), fetchNbaSchedule()]);
  if (pool.status !== "ok") return { ok: false, message: pool.message };
  const draft = picks.status === "ok" ? picks.data : new Map<number, number>();

  const lines = pool.data.flatMap((p) => [
    ...(p.projection ? [{ source: ESPN_PROJECTION, kind: "projection" as const, playerId: p.playerId, playerName: p.name, line: p.projection }] : []),
    ...(p.actual ? [{ source: ESPN_ACTUAL, kind: "actual" as const, playerId: p.playerId, playerName: p.name, line: p.actual }] : []),
  ]);
  if (lines.length) {
    await db
      .insert(schema.playerProjections)
      .values(lines)
      .onConflictDoUpdate({
        target: [schema.playerProjections.source, schema.playerProjections.playerId],
        set: { playerName: sql`excluded.player_name`, line: sql`excluded.line`, updatedAt: new Date() },
      });
  }
  const players = pool.data.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    proTeamId: p.proTeamId,
    onTeamId: p.onTeamId,
    injuryStatus: p.injuryStatus,
    draftPick: draft.get(p.playerId) ?? null,
    adp: p.adp,
  }));
  if (players.length) {
    await db
      .insert(schema.players)
      .values(players)
      .onConflictDoUpdate({
        target: schema.players.playerId,
        set: {
          name: sql`excluded.name`,
          proTeamId: sql`excluded.pro_team_id`,
          onTeamId: sql`excluded.on_team_id`,
          injuryStatus: sql`excluded.injury_status`,
          draftPick: sql`excluded.draft_pick`,
          adp: sql`excluded.adp`,
          updatedAt: new Date(),
        },
      });
  }
  // Upsert so rows stored before opponents were tracked pick them up, and reschedules land.
  if (schedule.status === "ok" && schedule.data.games.length) {
    const { games, abbrevs } = schedule.data;
    await db
      .insert(schema.nbaGames)
      .values(games.map((g) => ({ ...g, abbrev: abbrevs.get(g.proTeamId) ?? null })))
      .onConflictDoUpdate({
        target: [schema.nbaGames.proTeamId, schema.nbaGames.day],
        set: { opponentProTeamId: sql`excluded.opponent_pro_team_id`, abbrev: sql`excluded.abbrev` },
      });
  }
  const withGames = pool.data.filter((p) => p.actual).length;
  return { ok: true, message: `Stored ${pool.data.length} players (${withGames} with games played)` };
}

export type AnalyticsData = {
  players: PlayerInput[];
  meta: Map<number, PlayerMeta>;
  /** NBA team id -> its game days. */
  gameDays: Map<number, Set<number>>;
  /** NBA team id -> its games with opponents (null where not stored yet), in day order. */
  games: Map<number, { day: number; opponent: number | null }[]>;
  /** NBA team id -> ESPN abbreviation. */
  abbrevs: Map<number, string>;
  sources: string[];
  updatedAt: Date | null;
};

/** Everything the analytics page reads from the database. */
export async function loadAnalyticsData(): Promise<AnalyticsData> {
  const empty: AnalyticsData = { players: [], meta: new Map(), gameDays: new Map(), games: new Map(), abbrevs: new Map(), sources: [], updatedAt: null };
  if (!db) return empty;
  const [lineRows, metaRows, gameRows] = await Promise.all([
    db.select().from(schema.playerProjections),
    db.select().from(schema.players),
    db.select().from(schema.nbaGames),
  ]);
  const byPlayer = new Map<number, PlayerInput>();
  let updatedAt: Date | null = null;
  for (const r of lineRows) {
    const p = byPlayer.get(r.playerId) ?? { playerId: r.playerId, name: r.playerName, projections: [], actual: null };
    if (r.kind === "actual") p.actual = r.line;
    else p.projections.push(r.line);
    byPlayer.set(r.playerId, p);
    if (!updatedAt || r.updatedAt > updatedAt) updatedAt = r.updatedAt;
  }
  const gameDays = new Map<number, Set<number>>();
  const games = new Map<number, { day: number; opponent: number | null }[]>();
  const abbrevs = new Map<number, string>();
  for (const g of [...gameRows].sort((a, b) => a.day - b.day)) {
    (gameDays.get(g.proTeamId) ?? gameDays.set(g.proTeamId, new Set()).get(g.proTeamId)!).add(g.day);
    (games.get(g.proTeamId) ?? games.set(g.proTeamId, []).get(g.proTeamId)!).push({ day: g.day, opponent: g.opponentProTeamId });
    if (g.abbrev) abbrevs.set(g.proTeamId, g.abbrev);
  }
  return {
    players: [...byPlayer.values()],
    meta: new Map(metaRows.map((m) => [m.playerId, { proTeamId: m.proTeamId, injuryStatus: m.injuryStatus, onTeamId: m.onTeamId, draftPick: m.draftPick, adp: m.adp }])),
    gameDays,
    games,
    abbrevs,
    sources: [...new Set(lineRows.filter((r) => r.kind === "projection").map((r) => r.source))],
    updatedAt,
  };
}
