import type { LeagueConfig, Duo } from "@/types/league";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
/** Week 1 runs Tuesday Oct 20 to Sunday Oct 25, so it is 6 days long. */
const FIRST_WEEK_DAYS = 6;
/**
 * ESPN plays 24 matchups across 25 calendar weeks. The extra week is the
 * All-Star break (no games Feb 19 to 24), which ESPN folds into matchup 18,
 * Feb 15 to 28. Confirmed against the ESPN league schedule on 8 Oct 2026.
 */
const DOUBLE_WEEK = 18;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const SEASON_START = Date.UTC(2026, 9, 20);
export const SEASON_WEEKS = 24;
/** Semifinals, then finals and the 3rd place game. */
export const PLAYOFF_WEEKS = 2;
export const DEFAULT_REGULAR_WEEKS = SEASON_WEEKS - PLAYOFF_WEEKS;
export const ESPN_LEAGUE_ID = 1315568920;
export const ESPN_SEASON = 2027;
/** Active roster spots per team (10 starters + 3 bench). IR spots are on top of this. */
export const ROSTER_SIZE = 13;
export const IR_SLOTS = 3;

const MANAGER_PAIRS: [string, string][] = [
  ["Brian", "Stanley"],
  ["Eugene", "Eddy"],
  ["Taiyi", "Steve"],
  ["Ivan", "Scott"],
  ["Kennith", "Stephen"],
  ["Akil", "Benson"],
];

/** Start of calendar week n (1-based), in UTC ms. Week 1 is short because the season tips off on a Tuesday. */
const calendarWeekStart = (n: number): number =>
  n === 1 ? SEASON_START : SEASON_START + (FIRST_WEEK_DAYS + DAYS_PER_WEEK * (n - 2)) * MS_PER_DAY;

/** First and last day (UTC ms) of ESPN matchup week `week`. */
export function weekBounds(week: number): [number, number] {
  const firstCal = week <= DOUBLE_WEEK ? week : week + 1;
  const lastCal = week === DOUBLE_WEEK ? week + 1 : firstCal;
  return [calendarWeekStart(firstCal), calendarWeekStart(lastCal + 1) - MS_PER_DAY];
}

/** Human date range for a matchup week, e.g. "Oct 26 to Nov 1". */
export function weekRange(week: number): string {
  return spanRange(week, week);
}

/** Human date range from the start of one week to the end of another, e.g. "Oct 20 to Mar 28". */
export function spanRange(fromWeek: number, toWeek: number): string {
  const start = weekBounds(fromWeek)[0];
  const end = weekBounds(toWeek)[1];
  const a = new Date(start);
  const b = new Date(end);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} to ${sameMonth ? "" : MONTHS[b.getUTCMonth()] + " "}${b.getUTCDate()}`;
}

/** Which matchup week the calendar says it is right now, clamped to the season. */
export function weekFromDate(now = Date.now(), weeks = SEASON_WEEKS): number {
  for (let w = 1; w <= weeks; w++) {
    if (now < weekBounds(w)[1] + MS_PER_DAY) return w;
  }
  return weeks;
}

/** Starting config before the commissioner edits anything. */
export function defaultConfig(): LeagueConfig {
  const duos: Duo[] = MANAGER_PAIRS.map(([a, b], i) => ({
    id: `d${i + 1}`,
    name: `${a} & ${b}`,
    a,
    b,
    espnA: null,
    espnB: null,
  }));
  const tbd = "The commissioner adds this in admin.";
  return {
    name: "Gooners",
    buyIn: 20,
    weeks: SEASON_WEEKS,
    regularWeeks: DEFAULT_REGULAR_WEEKS,
    seed1Pick: null,
    currentWeekOverride: null,
    duos,
    punishments: {
      "4": { title: "Punishment to be announced", text: tbd, level: 1 },
      "5": { title: "Punishment to be announced", text: tbd, level: 2 },
      "6": { title: "Punishment to be announced", text: tbd, level: 3 },
    },
    schedule: {},
    manualRosters: {},
  };
}

/** Fill any keys missing from a stored config, so older rows keep working. */
export function normalizeConfig(raw: Partial<LeagueConfig> | null | undefined): LeagueConfig {
  const base = defaultConfig();
  if (!raw) return base;
  // Configs saved before playoffs existed only have `weeks`; carve the playoffs out of it.
  const regularWeeks = raw.regularWeeks ?? (raw.weeks ?? SEASON_WEEKS) - PLAYOFF_WEEKS;
  return {
    ...base,
    ...raw,
    regularWeeks,
    weeks: regularWeeks + PLAYOFF_WEEKS,
    seed1Pick: raw.seed1Pick ?? null,
    duos: (raw.duos ?? base.duos).map((d) => ({ ...d, espnA: d.espnA ?? null, espnB: d.espnB ?? null })),
    punishments: { ...base.punishments, ...(raw.punishments ?? {}) },
  };
}
