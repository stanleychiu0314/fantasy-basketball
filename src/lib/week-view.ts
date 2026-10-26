import { lineupTotals, type GameWindow, type PlayerMeta, type RatedPlayer, type TeamRosters } from "@/lib/analytics";
import { formatValue, memberKeys, type Category } from "@/lib/scoring";
import type { Duo, MemberKey, PlayerWeek, StatLine } from "@/types/league";

/** Pure rules behind the admin week screen, kept apart from the page so they can be unit-tested. */

const TIE_EPSILON = 1e-12;
const OUT = "OUT";

export type Manager = { name: string; key: MemberKey; team: number | null };
export type ManagerGames = Manager & { played: number; left: number };
/** 1 = the first side leads, -1 = the second side leads, 0 = tied, null = no value to compare. */
export type Lead = 1 | -1 | 0 | null;

/** A duo's two managers, member a (ESPN team A) then b, or `first` first when he is in the duo. */
export function managersOf(duo: Duo, first?: string): Manager[] {
  const [ka, kb] = memberKeys(duo);
  const a = { name: duo.a, key: ka, team: duo.espnA };
  const b = { name: duo.b, key: kb, team: duo.espnB };
  return b.name === first ? [b, a] : [a, b];
}

/** Games a member's players have played this week, active lineup days only. */
export const gamesPlayed = (rows: PlayerWeek[], key: MemberKey) =>
  rows.reduce((n, r) => (r.member === key ? n + r.games : n), 0);

/**
 * Games played so far and projected games left for each manager. Games left are the
 * manager's own lineup games in the remaining-days window, so 10 daily spots cap them.
 */
export function managerGames(
  managers: Manager[],
  rows: PlayerWeek[],
  rosters: TeamRosters,
  rated: Map<number, RatedPlayer>,
  window: GameWindow,
): ManagerGames[] {
  return managers.map((m) => ({
    ...m,
    played: gamesPlayed(rows, m.key),
    left: m.team === null ? 0 : lineupTotals(rosters[m.team] ?? [], rated, window).games,
  }));
}

/** Who leads one category, with turnovers counted lower-is-better. */
export function leadOf(cat: Category, mine: number | null, theirs: number | null): Lead {
  if (mine === null || theirs === null) return null;
  const d = mine - theirs;
  if (Math.abs(d) < TIE_EPSILON) return 0;
  return (d > 0) !== cat.low ? 1 : -1;
}

/** Signed difference (mine minus theirs) in the category's own format, e.g. "+12" or "-.034". */
export function formatDiff(cat: Category, mine: number | null, theirs: number | null): string {
  if (mine === null || theirs === null) return formatValue(cat, null);
  const d = mine - theirs;
  const text = formatValue(cat, Math.abs(d));
  // A difference that rounds to zero reads as even, not "+0".
  if (/^[.0]+$/.test(text)) return text;
  return `${d > 0 ? "+" : "-"}${text}`;
}

export type RosterRow = {
  playerId: number;
  name: string;
  /** This week's active-lineup totals, null when he has not played for this manager yet. */
  line: StatLine | null;
  played: number;
  left: number;
  /** Null when the week has not started, so "today" means nothing for it. */
  today: boolean | null;
  tag: "IR" | "OUT" | "Dropped" | null;
};

/**
 * One manager's box: every player on his roster, then anyone who played for him this
 * week and has since been dropped, since their games still count toward the week.
 */
export function rosterRows(args: {
  roster: { id: number; name: string; ir?: boolean }[];
  rows: PlayerWeek[];
  member: MemberKey;
  meta: Map<number, PlayerMeta>;
  gamesLeft: (playerId: number) => number;
  playsToday: ((playerId: number) => boolean) | null;
}): RosterRow[] {
  const { roster, rows, member, meta, gamesLeft, playsToday } = args;
  const mine = new Map(rows.filter((r) => r.member === member).map((r) => [r.playerId, r]));
  const onRoster = new Set(roster.map((p) => p.id));
  const current = roster.map((p): RosterRow => {
    const week = mine.get(p.id);
    return {
      playerId: p.id,
      name: p.name,
      line: week ?? null,
      played: week?.games ?? 0,
      // IR never plays, so nothing is left for him even if his NBA team has games.
      left: p.ir ? 0 : gamesLeft(p.id),
      today: playsToday ? !p.ir && playsToday(p.id) : null,
      tag: p.ir ? "IR" : meta.get(p.id)?.injuryStatus === OUT ? "OUT" : null,
    };
  });
  const dropped = [...mine.values()]
    .filter((r) => !onRoster.has(r.playerId))
    .map((r): RosterRow => ({ playerId: r.playerId, name: r.name, line: r, played: r.games, left: 0, today: playsToday ? false : null, tag: "Dropped" }));
  return [...current, ...dropped];
}
