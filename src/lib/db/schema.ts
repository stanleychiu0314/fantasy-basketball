import { boolean, index, integer, jsonb, pgTable, primaryKey, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { LeagueConfig, StatLine } from "@/types/league";
import type { EspnSnapshot, SeasonLine } from "@/lib/espn";

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

/**
 * Player season lines, one row per player per source. "espn" is ESPN's season
 * projection and "espn-actual" is the season so far; any projection file added
 * later becomes another source and is averaged in.
 */
export const playerProjections = pgTable(
  "player_projections",
  {
    source: text("source").notNull(),
    kind: text("kind").$type<"projection" | "actual">().notNull(),
    playerId: integer("player_id").notNull(),
    playerName: text("player_name").notNull(),
    /** Season totals plus games played (gp). */
    line: jsonb("line").$type<SeasonLine>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.playerId] })],
);

/**
 * Every player in ESPN's pool with what the analytics need besides stats: who
 * rosters him (null = free agent, i.e. the waiver wire), injury status, and what
 * he cost in this league's draft, used as his trade value.
 */
export const players = pgTable("players", {
  playerId: integer("player_id").primaryKey(),
  name: text("name").notNull(),
  proTeamId: integer("pro_team_id").notNull(),
  onTeamId: integer("on_team_id"),
  injuryStatus: text("injury_status").notNull(),
  /** Overall pick in this league's draft; null if he went undrafted here. */
  draftPick: integer("draft_pick"),
  /** ESPN average draft position across all leagues, the fallback trade value. */
  adp: real("adp"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** NBA game days per pro team, so each week's projection counts real games. */
export const nbaGames = pgTable(
  "nba_games",
  {
    proTeamId: integer("pro_team_id").notNull(),
    /** ESPN scoring period: day 1 is opening night. */
    day: integer("day").notNull(),
    /** The NBA team played that day; null for rows stored before opponents were tracked. */
    opponentProTeamId: integer("opponent_pro_team_id"),
    /** This team's ESPN abbreviation (e.g. "NY"), repeated per row so no extra table is needed. */
    abbrev: text("abbrev"),
  },
  (t) => [primaryKey({ columns: [t.proTeamId, t.day] })],
);

/**
 * Analytics saved by the cron so pages read them instead of recomputing per request.
 * key is "week_moves:<week>" or "trades"; data is plain JSON (no Maps).
 */
export const analyticsSnapshots = pgTable("analytics_snapshots", {
  key: text("key").primaryKey(),
  kind: text("kind").$type<"week_moves" | "trades">().notNull(),
  week: integer("week"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
  data: jsonb("data").notNull(),
});
