import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EspnCache } from "@/lib/db/schema";
import { fetchDay, fetchEspn, type EspnSnapshot, type RosterPlayer } from "@/lib/espn";
import { defaultConfig, normalizeConfig, SEASON_START, weekFromDate } from "@/lib/season";
import { FIELDS, memberKeys } from "@/lib/scoring";
import { detectTeammateMoves } from "@/lib/trades";
import type { LeagueConfig, LeagueState, MemberKey, PlayerWeek, RosterEntry, ScoreEdit, StatLine } from "@/types/league";

const CONFIG_ROW_ID = 1;
/** How stale ESPN data may get before a page view triggers a fresh sync. */
const SYNC_INTERVAL_MS = 5 * 60_000;
/** Cap on game days fetched per sync, so one request never runs long. Backfill continues next sync. */
const MAX_DAYS_PER_SYNC = 7;
const MS_PER_DAY = 86_400_000;

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
function buildRosters(config: LeagueConfig, espnRosters: Record<number, RosterPlayer[]> | undefined) {
  const rosters: Record<MemberKey, RosterEntry[]> = Object.fromEntries(
    Object.entries(config.manualRosters).map(([k, names]) => [k, names.map((name) => ({ name, ir: false }))]),
  );
  if (!espnRosters) return rosters;
  for (const [teamId, key] of teamToMember(config)) {
    const players = espnRosters[teamId];
    if (players?.length) rosters[key] = players.map((p) => ({ name: p.name, ir: !!p.ir }));
  }
  return rosters;
}

/** ESPN game day number to matchup week. Day 1 is the season opener. */
const weekOfDay = (day: number) => weekFromDate(SEASON_START + (day - 1) * MS_PER_DAY);

/** camelCase property name to the snake_case column name used in schema.ts. */
const toColumn = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

type ConfigRow = { config: LeagueConfig; espnCache: EspnCache | null; lastSynced: Date | null; lastDaySynced: number };

export async function readConfig(): Promise<ConfigRow> {
  if (!db) return { config: defaultConfig(), espnCache: null, lastSynced: null, lastDaySynced: 0 };
  const [row] = await db.select().from(schema.leagueConfig).where(eq(schema.leagueConfig.id, CONFIG_ROW_ID));
  return {
    config: normalizeConfig(row?.data),
    espnCache: row?.espnCache ?? null,
    lastSynced: row?.lastSynced ?? null,
    lastDaySynced: row?.lastDaySynced ?? 0,
  };
}

export async function writeConfig(config: LeagueConfig): Promise<void> {
  if (!db) throw new Error("No database connected");
  await db
    .insert(schema.leagueConfig)
    .values({ id: CONFIG_ROW_ID, data: config })
    .onConflictDoUpdate({ target: schema.leagueConfig.id, set: { data: config, updatedAt: new Date() } });
}

/**
 * Pull ESPN and store: every mapped team's weekly totals, finished-week flags,
 * per-player daily stats, and any teammate-to-teammate player moves.
 * Rows entered by hand are never overwritten.
 */
export async function syncFromEspn(): Promise<{ ok: boolean; message: string }> {
  if (!db) return { ok: false, message: "No database connected" };
  const result = await fetchEspn();
  if (result.status !== "ok") return { ok: false, message: result.message };
  const snap = result.data;
  const { config, espnCache, lastDaySynced } = await readConfig();
  const members = teamToMember(config);

  // 1. Weekly team totals.
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

  // 2. Weeks ESPN has moved past are final.
  if (snap.currentWeek !== null) {
    const finished = Object.keys(snap.stats).map(Number).filter((w) => w < snap.currentWeek!);
    if (finished.length) {
      await db.insert(schema.weekStatus).values(finished.map((week) => ({ week, final: true }))).onConflictDoNothing();
    }
  }

  // 3. Teammate trades, found by comparing rosters with the previous sync.
  const moves = detectTeammateMoves(config, espnCache?.rosters, snap.rosters);
  if (moves.length) await db.insert(schema.tradeAlerts).values(moves).onConflictDoNothing();

  // 4. Player stats per game day. Re-fetch the last synced day because it may have been in progress.
  const fromDay = Math.max(1, lastDaySynced);
  const toDay = Math.min(snap.latestDay, fromDay + MAX_DAYS_PER_SYNC - 1);
  const updateCols = Object.fromEntries(
    ["playerName", "espnTeamId", "lineupSlot", "active", ...FIELDS].map((k) => [k, sql.raw(`excluded."${toColumn(k)}"`)]),
  );
  let doneDay = lastDaySynced;
  let playerRows = 0;
  for (let day = fromDay; day <= toDay; day++) {
    const r = await fetchDay(day);
    if (r.status !== "ok") break;
    if (r.data.length) {
      const values = r.data.map((p) => ({
        day: p.day,
        week: weekOfDay(p.day),
        playerId: p.playerId,
        playerName: p.name,
        espnTeamId: p.teamId,
        lineupSlot: p.lineupSlot,
        active: p.active,
        ...p.stats,
      }));
      await db
        .insert(schema.playerDayStats)
        .values(values)
        .onConflictDoUpdate({ target: [schema.playerDayStats.day, schema.playerDayStats.playerId], set: updateCols });
      playerRows += values.length;
    }
    doneDay = day;
  }

  const cache: EspnCache = { teams: snap.teams, rosters: snap.rosters, currentWeek: snap.currentWeek, latestDay: snap.latestDay };
  await db
    .insert(schema.leagueConfig)
    .values({ id: CONFIG_ROW_ID, data: config, espnCache: cache, lastSynced: new Date(), lastDaySynced: doneDay })
    .onConflictDoUpdate({
      target: schema.leagueConfig.id,
      set: { espnCache: cache, lastSynced: new Date(), lastDaySynced: doneDay },
    });

  return { ok: true, message: `Synced ${rows.length} team-weeks and ${playerRows} player-days from ESPN` };
}

/** Everything the public page needs. Refreshes from ESPN first when data is stale. */
export async function loadLeagueState(): Promise<LeagueState> {
  if (!db) return loadWithoutDatabase();

  const before = await readConfig();
  if (!before.lastSynced || Date.now() - before.lastSynced.getTime() > SYNC_INTERVAL_MS) {
    // A failed sync should never take the site down; stored data still renders.
    await syncFromEspn().catch(() => undefined);
  }
  const { config, espnCache, lastSynced } = await readConfig();

  const [statRows, finals, paidRows, alerts] = await Promise.all([
    db.select().from(schema.teamWeekStats),
    db.select().from(schema.weekStatus),
    db.select().from(schema.payments),
    db.select().from(schema.tradeAlerts).where(eq(schema.tradeAlerts.dismissed, false)).orderBy(desc(schema.tradeAlerts.detectedAt)),
  ]);

  const scores: LeagueState["scores"] = {};
  const manual: LeagueState["manual"] = [];
  for (const r of statRows) {
    (scores[r.week] ??= {})[r.member] = r.stats;
    if (r.source === "manual") manual.push({ week: r.week, member: r.member });
  }
  const final: LeagueState["final"] = Object.fromEntries(finals.map((f) => [f.week, f.final]));
  const paid: LeagueState["paid"] = Object.fromEntries(paidRows.map((p) => [p.member, p.paid]));

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
    paid,
    manual,
    tradeAlerts: alerts.map((a) => ({
      id: a.id,
      playerName: a.playerName,
      fromMember: a.fromMember,
      toMember: a.toMember,
      detectedAt: a.detectedAt.toISOString(),
    })),
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
    paid: {},
    manual: [],
    tradeAlerts: [],
  };
}

/** Each player's totals for one week, active-lineup days only, keyed to league members. */
export async function playerWeek(week: number): Promise<PlayerWeek[]> {
  if (!db) return [];
  const { config } = await readConfig();
  const members = teamToMember(config);
  const t = schema.playerDayStats;
  const sums = Object.fromEntries(FIELDS.map((f) => [f, sql<number>`sum(${t[f]})::int`]));
  const rows = await db
    .select({
      playerId: t.playerId,
      name: sql<string>`max(${t.playerName})`,
      teamId: t.espnTeamId,
      games: sql<number>`count(*)::int`,
      ...sums,
    })
    .from(t)
    .where(and(eq(t.week, week), eq(t.active, true)))
    .groupBy(t.playerId, t.espnTeamId)
    .orderBy(asc(t.espnTeamId));
  return rows.flatMap((r) => {
    const member = members.get(r.teamId);
    if (!member) return [];
    const raw = r as Record<string, unknown>;
    const line = Object.fromEntries(FIELDS.map((f) => [f, Number(raw[f]) || 0])) as StatLine;
    return [{ ...line, playerId: r.playerId, name: r.name, member, games: r.games }];
  });
}

/** Save or clear a manual score, logging the change. */
export async function saveManualStats(week: number, member: MemberKey, stats: StatLine | null): Promise<void> {
  if (!db) throw new Error("No database connected");
  const t = schema.teamWeekStats;
  const where = and(eq(t.week, week), eq(t.member, member));
  const [existing] = await db.select().from(t).where(where);

  if (stats === null) {
    if (existing?.source !== "manual") return;
    // Drop the manual row; the next sync restores ESPN's numbers.
    await db.delete(t).where(and(where, eq(t.source, "manual")));
    await db.insert(schema.scoreEdits).values({ week, member, action: "revert", oldStats: existing.stats, newStats: null });
    return;
  }
  await db
    .insert(t)
    .values({ week, member, stats, source: "manual" })
    .onConflictDoUpdate({ target: [t.week, t.member], set: { stats, source: "manual", updatedAt: new Date() } });
  await db.insert(schema.scoreEdits).values({ week, member, action: "set", oldStats: existing?.stats ?? null, newStats: stats });
}

export async function setWeekFinal(week: number, final: boolean): Promise<void> {
  if (!db) throw new Error("No database connected");
  await db.insert(schema.weekStatus).values({ week, final }).onConflictDoUpdate({ target: schema.weekStatus.week, set: { final } });
}

export async function setPaid(member: MemberKey, paid: boolean): Promise<void> {
  if (!db) throw new Error("No database connected");
  const paidAt = paid ? new Date() : null;
  await db
    .insert(schema.payments)
    .values({ member, paid, paidAt })
    .onConflictDoUpdate({ target: schema.payments.member, set: { paid, paidAt } });
}

export async function dismissTradeAlert(id: string): Promise<void> {
  if (!db) throw new Error("No database connected");
  await db.update(schema.tradeAlerts).set({ dismissed: true }).where(eq(schema.tradeAlerts.id, id));
}

/** Most recent manual score changes, newest first. */
export async function recentScoreEdits(limit = 50): Promise<ScoreEdit[]> {
  if (!db) return [];
  const rows = await db.select().from(schema.scoreEdits).orderBy(desc(schema.scoreEdits.createdAt)).limit(limit);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
