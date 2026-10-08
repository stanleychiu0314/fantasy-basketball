import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { LeagueConfig, StatLine } from "@/types/league";
import type { EspnSnapshot } from "@/lib/espn";

export type EspnCache = Pick<EspnSnapshot, "teams" | "rosters" | "currentWeek" | "latestDay">;

/** Single row (id = 1) holding everything the commissioner edits. */
export const leagueConfig = pgTable("league_config", {
  id: integer("id").primaryKey(),
  data: jsonb("data").$type<LeagueConfig>().notNull(),
  /** Teams and rosters from the last ESPN sync, so page loads do not hit ESPN. */
  espnCache: jsonb("espn_cache").$type<EspnCache>(),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
  /** Highest ESPN game day whose player stats have been fetched. */
  lastDaySynced: integer("last_day_synced").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One row per ESPN team per week. Manual rows override ESPN rows, so a bad
 * ESPN number can be corrected without the next sync overwriting it.
 */
export const teamWeekStats = pgTable(
  "team_week_stats",
  {
    week: integer("week").notNull(),
    member: text("member").notNull(),
    stats: jsonb("stats").$type<StatLine>().notNull(),
    source: text("source").$type<"espn" | "manual">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.week, t.member] })],
);

/** Whether a week's results are locked. Set by sync once ESPN moves past the week, or by hand. */
export const weekStatus = pgTable("week_status", {
  week: integer("week").primaryKey(),
  final: boolean("final").notNull().default(false),
});

/** Who has paid the buy-in. One row per manager (member key). */
export const payments = pgTable("payments", {
  member: text("member").primaryKey(),
  paid: boolean("paid").notNull().default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

/** Audit log of every manual score change, for settling disputes. */
export const scoreEdits = pgTable("score_edits", {
  id: serial("id").primaryKey(),
  week: integer("week").notNull(),
  member: text("member").notNull(),
  action: text("action").$type<"set" | "revert">().notNull(),
  oldStats: jsonb("old_stats").$type<StatLine>(),
  newStats: jsonb("new_stats").$type<StatLine>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A player who moved directly between two teammates' ESPN teams, which the trade rule forbids. */
export const tradeAlerts = pgTable("trade_alerts", {
  /** playerId:fromTeam:toTeam, so the same move is only flagged once. */
  id: text("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  playerName: text("player_name").notNull(),
  fromMember: text("from_member").notNull(),
  toMember: text("to_member").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  dismissed: boolean("dismissed").notNull().default(false),
});

/**
 * Each player's stats for each game day. Stats are columns (not JSON) so a
 * week's player totals can be summed in SQL. Only `active` rows count toward
 * a team, matching ESPN (bench and IR do not score).
 */
export const playerDayStats = pgTable(
  "player_day_stats",
  {
    day: integer("day").notNull(),
    week: integer("week").notNull(),
    playerId: integer("player_id").notNull(),
    playerName: text("player_name").notNull(),
    espnTeamId: integer("espn_team_id").notNull(),
    lineupSlot: integer("lineup_slot").notNull(),
    active: boolean("active").notNull(),
    fgm: integer("fgm").notNull(),
    fga: integer("fga").notNull(),
    ftm: integer("ftm").notNull(),
    fta: integer("fta").notNull(),
    tpm: integer("tpm").notNull(),
    reb: integer("reb").notNull(),
    ast: integer("ast").notNull(),
    stl: integer("stl").notNull(),
    blk: integer("blk").notNull(),
    to: integer("to").notNull(),
    pts: integer("pts").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.playerId] }), index("player_day_stats_week_idx").on(t.week)],
);
