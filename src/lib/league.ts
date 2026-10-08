import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fetchEspn, type EspnSnapshot } from "@/lib/espn";
import { defaultConfig, normalizeConfig, weekFromDate } from "@/lib/season";
import { memberKeys } from "@/lib/scoring";
import type { LeagueConfig, LeagueState, MemberKey, StatLine } from "@/types/league";

const CONFIG_ROW_ID = 1;
/** How stale ESPN data may get before a page view triggers a fresh sync. */
const SYNC_INTERVAL_MS = 5 * 60_000;

type EspnCache = Pick<EspnSnapshot, "teams" | "rosters" | "currentWeek">;

/** In-memory ESPN cache, used only when no database is connected (local preview). */
let memo: { at: number; snap: EspnSnapshot | null; status: LeagueState["espnStatus"] } | null = null;

/** Map ESPN team ids to this league's member keys ("d1a", "d1b", ...). */
function teamToMember(config: LeagueConfig): Map<number, MemberKey> {
  const map = new Map<number, MemberKey>();
  for (const duo of config.duos) {
    const [ka, kb] = memberKeys(duo);
    if (duo.espnA !== null) map.set(duo.espnA, ka);
    if (duo.espnB !== null) map.set(duo.espnB, kb);
  }
  return map;
}

/** Turn ESPN team rosters into member rosters, falling back to manual ones. */
function buildRosters(config: LeagueConfig, espnRosters: Record<number, string[]> | undefined) {
  const rosters: Record<MemberKey, string[]> = { ...config.manualRosters };
  if (!espnRosters) return rosters;
  for (const [teamId, key] of teamToMember(config)) {
    const players = espnRosters[teamId];
    if (players?.length) rosters[key] = players;
  }
  return rosters;
}

export async function readConfig(): Promise<{ config: LeagueConfig; espnCache: EspnCache | null; lastSynced: Date | null }> {
  if (!db) return { config: defaultConfig(), espnCache: null, lastSynced: null };
  const rows = await db.select().from(schema.leagueConfig).where(eq(schema.leagueConfig.id, CONFIG_ROW_ID));
  const row = rows[0];
  return { config: normalizeConfig(row?.data), espnCache: row?.espnCache ?? null, lastSynced: row?.lastSynced ?? null };
}

export async function writeConfig(config: LeagueConfig): Promise<void> {
  if (!db) throw new Error("No database connected");
  await db
    .insert(schema.leagueConfig)
    .values({ id: CONFIG_ROW_ID, data: config })
    .onConflictDoUpdate({ target: schema.leagueConfig.id, set: { data: config, updatedAt: new Date() } });
}

/**
 * Pull ESPN and store every mapped team's weekly stats. Rows entered by hand
 * are never overwritten. Weeks before ESPN's current week are marked final.
 */
export async function syncFromEspn(): Promise<{ ok: boolean; message: string }> {
  if (!db) return { ok: false, message: "No database connected" };
  const result = await fetchEspn();
  if (result.status !== "ok") return { ok: false, message: result.message };
  const snap = result.data;
  const { config } = await readConfig();
  const members = teamToMember(config);

  const rows: { week: number; member: string; stats: StatLine; source: "espn" }[] = [];
  for (const [week, byTeam] of Object.entries(snap.stats)) {
    for (const [teamId, stats] of Object.entries(byTeam)) {
      const member = members.get(Number(teamId));
      if (member) rows.push({ week: Number(week), member, stats, source: "espn" });
    }
  }
  if (rows.length) {
    await db
      .insert(schema.teamWeekStats)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.teamWeekStats.week, schema.teamWeekStats.member],
        set: { stats: sql`excluded.stats`, updatedAt: new Date() },
        // Leave manual corrections alone.
        setWhere: eq(schema.teamWeekStats.source, "espn"),
      });
  }

  if (snap.currentWeek !== null) {
    const finished = Object.keys(snap.stats).map(Number).filter((w) => w < snap.currentWeek!);
    for (const week of finished) {
      await db.insert(schema.weekStatus).values({ week, final: true }).onConflictDoNothing();
    }
  }

  const cache: EspnCache = { teams: snap.teams, rosters: snap.rosters, currentWeek: snap.currentWeek };
  await db
    .insert(schema.leagueConfig)
    .values({ id: CONFIG_ROW_ID, data: config, espnCache: cache, lastSynced: new Date() })
    .onConflictDoUpdate({ target: schema.leagueConfig.id, set: { espnCache: cache, lastSynced: new Date() } });

  return { ok: true, message: `Synced ${rows.length} team-weeks from ESPN` };
}

/** Everything the public page needs. Refreshes from ESPN first when data is stale. */
export async function loadLeagueState(): Promise<LeagueState> {
  if (!db) return loadWithoutDatabase();

  let { lastSynced } = await readConfig();
  if (!lastSynced || Date.now() - lastSynced.getTime() > SYNC_INTERVAL_MS) {
    // A failed sync should never take the site down; stored data still renders.
    await syncFromEspn().catch(() => undefined);
  }
  const fresh = await readConfig();
  const { config, espnCache } = fresh;
  lastSynced = fresh.lastSynced;

  const statRows = await db.select().from(schema.teamWeekStats);
  const scores: LeagueState["scores"] = {};
  for (const r of statRows) (scores[r.week] ??= {})[r.member] = r.stats;

  const finals = await db.select().from(schema.weekStatus);
  const final: LeagueState["final"] = {};
  for (const f of finals) final[f.week] = f.final;

  return {
    config,
    currentWeek: config.currentWeekOverride ?? espnCache?.currentWeek ?? weekFromDate(Date.now(), config.weeks),
    scores,
    final,
    rosters: buildRosters(config, espnCache?.rosters),
    espnTeams: espnCache?.teams ?? [],
    espnStatus: espnCache ? "ok" : "off",
    lastSynced: lastSynced?.toISOString() ?? null,
    hasDatabase: true,
  };
}

/** Local preview before Neon is connected: default config plus live ESPN data. */
async function loadWithoutDatabase(): Promise<LeagueState> {
  const config = defaultConfig();
  if (!memo || Date.now() - memo.at > SYNC_INTERVAL_MS) {
    const r = await fetchEspn();
    memo = { at: Date.now(), snap: r.status === "ok" ? r.data : null, status: r.status };
  }
  const snap = memo.snap;
  const scores: LeagueState["scores"] = {};
  const members = teamToMember(config);
  for (const [week, byTeam] of Object.entries(snap?.stats ?? {})) {
    for (const [teamId, stats] of Object.entries(byTeam)) {
      const m = members.get(Number(teamId));
      if (m) (scores[Number(week)] ??= {})[m] = stats;
    }
  }
  return {
    config,
    currentWeek: snap?.currentWeek ?? weekFromDate(Date.now(), config.weeks),
    scores,
    final: {},
    rosters: buildRosters(config, snap?.rosters),
    espnTeams: snap?.teams ?? [],
    espnStatus: memo.status,
    lastSynced: new Date(memo.at).toISOString(),
    hasDatabase: false,
  };
}

export async function saveManualStats(week: number, member: MemberKey, stats: StatLine | null): Promise<void> {
  if (!db) throw new Error("No database connected");
  const where = and(eq(schema.teamWeekStats.week, week), eq(schema.teamWeekStats.member, member));
  if (stats === null) {
    // Drop the manual row; the next sync restores ESPN's numbers.
    await db.delete(schema.teamWeekStats).where(and(where, eq(schema.teamWeekStats.source, "manual")));
    return;
  }
  await db
    .insert(schema.teamWeekStats)
    .values({ week, member, stats, source: "manual" })
    .onConflictDoUpdate({
      target: [schema.teamWeekStats.week, schema.teamWeekStats.member],
      set: { stats, source: "manual", updatedAt: new Date() },
    });
}

export async function setWeekFinal(week: number, final: boolean): Promise<void> {
  if (!db) throw new Error("No database connected");
  await db
    .insert(schema.weekStatus)
    .values({ week, final })
    .onConflictDoUpdate({ target: schema.weekStatus.week, set: { final } });
}

/** Which stored rows were typed by hand, so admin can show and revert them. */
export async function manualRows(): Promise<{ week: number; member: string }[]> {
  if (!db) return [];
  return db
    .select({ week: schema.teamWeekStats.week, member: schema.teamWeekStats.member })
    .from(schema.teamWeekStats)
    .where(eq(schema.teamWeekStats.source, "manual"));
}
