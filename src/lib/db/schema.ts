import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { LeagueConfig, StatLine } from "@/types/league";
import type { EspnSnapshot } from "@/lib/espn";

/** Single row (id = 1) holding everything the commissioner edits. */
export const leagueConfig = pgTable("league_config", {
  id: integer("id").primaryKey(),
  data: jsonb("data").$type<LeagueConfig>().notNull(),
  /** Teams and rosters from the last ESPN sync, so page loads do not hit ESPN. */
  espnCache: jsonb("espn_cache").$type<Pick<EspnSnapshot, "teams" | "rosters" | "currentWeek">>(),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
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
