import { lineupCap, lineupTotals, zScorer, type GameWindow, type PlayerMeta, type RatedPlayer, type TeamRosters } from "@/lib/analytics";
import { dayOfDate, gameDayAt, weekBounds } from "@/lib/season";
import { FIELDS, formatValue, memberKeys, type Category } from "@/lib/scoring";
import type { Duo, MemberKey, PlayerWeek, StatLine } from "@/types/league";

/** Pure rules behind the admin week screen, kept apart from the page so they can be unit-tested. */

const TIE_EPSILON = 1e-12;
const OUT = "OUT";
/** Players per manager shown as pills under the games table. */
export const TOP_DRAFTED = 5;
/** Players listed in the League tab. */
export const LEAGUE_TOP = 100;
/** A weekly z-score this far from 0 gets the strongest heat color. */
export const HEAT_FULL_Z = 2;
const MS_PER_DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Games each player has left in a week. Before the week starts that is the whole week.
 * During it, today and the days after: today's games count only for players with no
 * stats stored for today yet (`playedToday`), since ESPN adds a player's day stats once
 * his game starts and from then on they are in the live totals. Players listed OUT
 * count for zero. With `full`, every day of the week counts, as if it had not started
 * (what the saved week moves use).
 */
export function weekWindow(
  week: number,
  meta: Map<number, PlayerMeta>,
  gameDays: Map<number, Set<number>>,
  { full = false, now = Date.now(), playedToday = new Set<number>() }: { full?: boolean; now?: number; playedToday?: ReadonlySet<number> } = {},
): { window: GameWindow; started: boolean } {
  const [start, end] = weekBounds(week);
  const first = dayOfDate(start);
  const last = dayOfDate(end);
  const today = gameDayAt(now);
  const started = today >= first;
  const live = started && !full;
  const from = live ? today : first;
  const days = Array.from({ length: Math.max(0, last - from + 1) }, (_, i) => from + i);
  const playsOn = (playerId: number, day: number) => {
    const m = meta.get(playerId);
    if (!m || m.injuryStatus === OUT || !gameDays.get(m.proTeamId)?.has(day)) return false;
    return !(live && day === today && playedToday.has(playerId));
  };
  const gamesOf = (playerId: number) => days.filter((d) => playsOn(playerId, d)).length;
  // Day by day: each manager's lineup is set daily, so each day's 10 spots are simulated.
  // shortcut: today still offers all 10 spots even if some were used by games already played; fine while few teams fill 10 in one day.
  return { window: { gamesOf, cap: lineupCap(days.length), days, playsOn }, started };
}

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

export type StarPill = { playerId: number; name: string; games: number };

/** Earliest pick in this league's draft first, undrafted last, ties broken by player value. */
const byDraft = (meta: Map<number, PlayerMeta>, rated: Map<number, RatedPlayer>) => {
  const pick = (id: number) => meta.get(id)?.draftPick ?? Infinity;
  const value = (id: number) => rated.get(id)?.value ?? -Infinity;
  return (a: { id: number }, b: { id: number }) => pick(a.id) - pick(b.id) || value(b.id) - value(a.id);
};

/** A manager's top players by this league's draft pick, each with his games this week. */
export function topDrafted(
  roster: { id: number; name: string }[],
  meta: Map<number, PlayerMeta>,
  rated: Map<number, RatedPlayer>,
  gamesOf: (playerId: number) => number,
  limit = TOP_DRAFTED,
): StarPill[] {
  return [...roster]
    .sort(byDraft(meta, rated))
    .slice(0, limit)
    .map((p) => ({ playerId: p.id, name: p.name, games: gamesOf(p.id) }));
}

/** The real days of a matchup week with weekday labels (week 1 starts on a Tuesday, week 18 spans two weeks). */
export function weekDays(week: number): { day: number; label: string }[] {
  const [start, end] = weekBounds(week);
  return Array.from({ length: Math.round((end - start) / MS_PER_DAY) + 1 }, (_, i) => {
    const at = start + i * MS_PER_DAY;
    return { day: dayOfDate(at), label: WEEKDAYS[new Date(at).getUTCDay()] };
  });
}

export type ScheduleRow = { playerId: number; name: string; manager: string; tag: "IR" | "OUT" | null; plays: boolean[] };

/** One row per player across a duo's managers, by draft pick, marking each day his NBA team plays. */
export function scheduleRows(
  managers: { name: string; roster: { id: number; name: string; ir?: boolean }[] }[],
  meta: Map<number, PlayerMeta>,
  rated: Map<number, RatedPlayer>,
  gameDays: Map<number, Set<number>>,
  days: number[],
): ScheduleRow[] {
  return managers
    .flatMap((m) => m.roster.map((p) => ({ ...p, manager: m.name })))
    .sort(byDraft(meta, rated))
    .map((p) => {
      const m = meta.get(p.id);
      const games = m ? gameDays.get(m.proTeamId) : undefined;
      return {
        playerId: p.id,
        name: p.name,
        manager: p.manager,
        tag: p.ir ? "IR" : m?.injuryStatus === OUT ? "OUT" : null,
        plays: days.map((d) => !!games?.has(d)),
      };
    });
}

/** One player's totals over this week's games (bench days included). */
export type WeekLine = { playerId: number; name: string; games: number; totals: StatLine };

export type LeagueRow = {
  playerId: number;
  name: string;
  games: number;
  perGame: StatLine;
  /** Weekly 9-cat value: z-scores summed, against everyone who played this week. */
  value: number;
  /** z-score per category key, turnovers flipped so higher is always better. */
  z: Record<string, number>;
  /** "Manager · Duo", or null for a free agent. */
  owner: string | null;
  /** Index of the owner's duo in the league's duo list (for its color), or null. */
  duoIndex: number | null;
  side: "mine" | "theirs" | null;
};

/**
 * This week's league table: every player with a game this week, rated on his per-game
 * line with the same z-scores as ratePlayers, but with this week's players as the pool.
 */
export function leagueTable(args: {
  lines: WeekLine[];
  rosters: TeamRosters;
  duos: Duo[];
  mine: string;
  theirs: string;
  limit?: number;
}): LeagueRow[] {
  const { lines, rosters, duos, mine, theirs, limit = LEAGUE_TOP } = args;
  type Owner = Pick<LeagueRow, "owner" | "duoIndex" | "side">;
  const teamOwner = new Map<number, Owner>();
  duos.forEach((d, duoIndex) => {
    const side = d.id === mine ? "mine" : d.id === theirs ? "theirs" : null;
    if (d.espnA !== null) teamOwner.set(d.espnA, { owner: `${d.a} · ${d.name}`, duoIndex, side });
    if (d.espnB !== null) teamOwner.set(d.espnB, { owner: `${d.b} · ${d.name}`, duoIndex, side });
  });
  const ownerOf = new Map<number, Owner>();
  for (const [team, players] of Object.entries(rosters)) {
    const o = teamOwner.get(Number(team)) ?? { owner: `ESPN team ${team}`, duoIndex: null, side: null };
    for (const p of players) ownerOf.set(p.id, o);
  }
  const played = lines
    .filter((l) => l.games > 0)
    .map((l) => ({ ...l, perGame: Object.fromEntries(FIELDS.map((f) => [f, l.totals[f] / l.games])) as StatLine }));
  const score = zScorer(played.map((l) => l.perGame));
  return played
    .map((l) => ({
      playerId: l.playerId,
      name: l.name,
      games: l.games,
      perGame: l.perGame,
      ...score(l.perGame),
      ...(ownerOf.get(l.playerId) ?? { owner: null, duoIndex: null, side: null }),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Heat for a stat cell: z / HEAT_FULL_Z clamped to -1 (full red) .. 1 (full green); 0 is no color. */
export const heatLevel = (z: number) => Math.max(-1, Math.min(1, z / HEAT_FULL_Z));

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
