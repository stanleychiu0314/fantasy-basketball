import { sql } from "drizzle-orm";
import { playerDayStats } from "@/lib/db/schema";
import { FIELDS } from "@/lib/scoring";
import type { StatLine } from "@/types/league";

/**
 * One rule for "games played": a day counts only if its stat line has any stat.
 * ESPN stores an empty line for a rostered player who did not play (DNP or injured).
 * Every stat is a non-negative count, so "sum > 0" means "any stat".
 */
export const playedGame = (line: StatLine) => FIELDS.reduce((n, f) => n + line[f], 0) > 0;

/** The same rule in SQL: how many grouped player_day_stats rows are real games. */
export function gamesPlayedSql() {
  const anyStat = sql.join(FIELDS.map((f) => sql`${playerDayStats[f]}`), sql` + `);
  return sql<number>`(count(*) filter (where ${anyStat} > 0))::int`;
}
