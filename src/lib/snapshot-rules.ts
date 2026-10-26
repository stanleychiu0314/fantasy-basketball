import type { CategoryTarget, Pickup, TeamRosters } from "@/lib/analytics";
import type { StreamingReport } from "@/lib/streaming";

/** Pure rules for saved analytics, kept apart from the database code so they can be unit-tested. */

export const TRADES_KEY = "trades";
const WEEK_MOVES_PREFIX = "week_moves:";
/** Date.getUTCDay() for Monday: the cron computes week moves only then. */
const MONDAY = 1;

export const weekMovesKey = (week: number) => `${WEEK_MOVES_PREFIX}${week}`;
export const isMondayUtc = (at: Date) => at.getUTCDay() === MONDAY;

/** One week's saved suggestions. `streaming` is null when ESPN's defense data was unavailable. */
export type WeekMoves = { pickups: Pickup[]; targets: CategoryTarget[]; streaming: StreamingReport | null };

/**
 * Streaming saved from schedule rows that had no abbreviations or opponents (both are
 * written by the same upsert, so a blank abbreviation means the opponents were missing
 * too and every favorable/unfavorable count is a false 0). Such a snapshot is rebuilt.
 */
export const streamingIncomplete = ({ streaming }: WeekMoves) =>
  !!streaming && [...streaming.teams, ...streaming.candidates].some((r) => !r.abbrev);

/**
 * Drop suggested players who have been rostered since the snapshot was computed.
 * Rosters sync every few minutes while the snapshot is daily or weekly.
 */
export function filterStillAvailable(moves: WeekMoves, rosters: TeamRosters | undefined): WeekMoves {
  const taken = new Set(Object.values(rosters ?? {}).flat().map((p) => p.id));
  const free = (id: number) => !taken.has(id);
  return {
    pickups: moves.pickups.filter((p) => free(p.add.playerId)),
    targets: moves.targets.map((t) => ({ ...t, players: t.players.filter((x) => free(x.player.playerId)) })),
    streaming: moves.streaming && {
      ...moves.streaming,
      candidates: moves.streaming.candidates.filter((c) => free(c.playerId)),
    },
  };
}
