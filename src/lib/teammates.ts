import { CATS, catValue, FIELDS, memberKeys } from "@/lib/scoring";
import { weekBounds } from "@/lib/season";
import type { Duo, LeagueState, StatLine } from "@/types/league";

/** Categories won by each teammate (a = duo.a, b = duo.b) plus ties. */
export type Split = { a: number; b: number; ties: number };
/** One category in one week: each manager's value (null when no data) and who won it. */
export type TeammateCat = { key: string; a: number | null; b: number | null; winner: "a" | "b" | "tie" };
/** Active-lineup games played by each teammate (a = duo.a, b = duo.b). */
export type Games = { a: number; b: number };
export type TeammateWeek = Split & { week: number; cats: TeammateCat[]; games: Games };
export type TeammateMonth = { label: string; weeks: TeammateWeek[]; total: Split; games: Games };
export type TeammateReport = { months: TeammateMonth[]; total: Split; games: Games };
/** Active-lineup games per week per member key, as player_day_stats counts them. */
export type MemberGames = Record<number, Record<string, number>>;

/** Floating point slack when comparing two percentages for a tie. */
const TIE_EPSILON = 1e-12;

/** All zeros: ESPN lists the week, but this manager has no games in it yet. */
const blank = (line: StatLine) => FIELDS.every((f) => !line[f]);

const addTo = (t: Split, s: Split) => {
  t.a += s.a;
  t.b += s.b;
  t.ties += s.ties;
};

/**
 * Compare the two managers' own team totals in one week, category by category.
 * Turnovers: fewer wins. A category with no data on either side counts as a tie.
 * A week neither manager has played yet is skipped, so it does not read as 9 ties.
 */
function compareWeek(scores: LeagueState["scores"], week: number, duo: Duo): (Split & { cats: TeammateCat[] }) | null {
  const [ka, kb] = memberKeys(duo);
  const la = scores[week]?.[ka];
  const lb = scores[week]?.[kb];
  if (!la || !lb || (blank(la) && blank(lb))) return null;
  const out = { a: 0, b: 0, ties: 0, cats: [] as TeammateCat[] };
  for (const cat of CATS) {
    const x = catValue(la, cat);
    const y = catValue(lb, cat);
    const winner = x === null || y === null || Math.abs(x - y) < TIE_EPSILON ? "tie" : x > y !== cat.low ? "a" : "b";
    out[winner === "tie" ? "ties" : winner]++;
    out.cats.push({ key: cat.key, a: x, b: y, winner });
  }
  return out;
}

const addGames = (t: Games, g: Games) => {
  t.a += g.a;
  t.b += g.b;
};

/**
 * One row per week that has both managers' totals, grouped by the calendar month the
 * week starts in, with each manager's games played per week, month and season.
 */
export function teammateReport(scores: LeagueState["scores"], duo: Duo, weekCount: number, memberGames: MemberGames = {}): TeammateReport {
  const [ka, kb] = memberKeys(duo);
  const months = new Map<string, TeammateMonth>();
  const total: Split = { a: 0, b: 0, ties: 0 };
  const games: Games = { a: 0, b: 0 };
  for (let week = 1; week <= weekCount; week++) {
    const split = compareWeek(scores, week, duo);
    if (!split) continue;
    const g = { a: memberGames[week]?.[ka] ?? 0, b: memberGames[week]?.[kb] ?? 0 };
    const label = new Date(weekBounds(week)[0]).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const month = months.get(label) ?? { label, weeks: [], total: { a: 0, b: 0, ties: 0 }, games: { a: 0, b: 0 } };
    month.weeks.push({ week, ...split, games: g });
    addTo(month.total, split);
    addTo(total, split);
    addGames(month.games, g);
    addGames(games, g);
    months.set(label, month);
  }
  return { months: [...months.values()], total, games };
}
