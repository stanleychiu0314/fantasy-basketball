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
  // The schedule rarely changes, so it is only written the first time (or after a wipe).
  if (schedule.status === "ok" && schedule.data.length) {
    await db.insert(schema.nbaGames).values(schedule.data).onConflictDoNothing();
  }
  const withGames = pool.data.filter((p) => p.actual).length;
  return { ok: true, message: `Stored ${pool.data.length} players (${withGames} with games played)` };
}

export type AnalyticsData = {
  players: PlayerInput[];
  meta: Map<number, PlayerMeta>;
  /** NBA team id -> its game days. */
  gameDays: Map<number, Set<number>>;
  sources: string[];
  updatedAt: Date | null;
};

/** Everything the analytics page reads from the database. */
export async function loadAnalyticsData(): Promise<AnalyticsData> {
  const empty: AnalyticsData = { players: [], meta: new Map(), gameDays: new Map(), sources: [], updatedAt: null };
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
  for (const g of gameRows) (gameDays.get(g.proTeamId) ?? gameDays.set(g.proTeamId, new Set()).get(g.proTeamId)!).add(g.day);
  return {
    players: [...byPlayer.values()],
    meta: new Map(metaRows.map((m) => [m.playerId, { proTeamId: m.proTeamId, injuryStatus: m.injuryStatus, onTeamId: m.onTeamId, draftPick: m.draftPick, adp: m.adp }])),
    gameDays,
    sources: [...new Set(lineRows.filter((r) => r.kind === "projection").map((r) => r.source))],
    updatedAt,
  };
}
