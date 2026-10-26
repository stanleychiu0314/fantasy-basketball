import { CATS, catValue, FIELDS, memberKeys } from "@/lib/scoring";
import { weekBounds } from "@/lib/season";
import type { Duo, LeagueState, StatLine } from "@/types/league";

/** Categories won by each teammate (a = duo.a, b = duo.b) plus ties. */
export type Split = { a: number; b: number; ties: number };
export type TeammateWeek = Split & { week: number };
export type TeammateMonth = { label: string; weeks: TeammateWeek[]; total: Split };
export type TeammateReport = { months: TeammateMonth[]; total: Split };

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
function compareWeek(scores: LeagueState["scores"], week: number, duo: Duo): Split | null {
  const [ka, kb] = memberKeys(duo);
  const la = scores[week]?.[ka];
  const lb = scores[week]?.[kb];
  if (!la || !lb || (blank(la) && blank(lb))) return null;
  const out: Split = { a: 0, b: 0, ties: 0 };
  for (const cat of CATS) {
    const x = catValue(la, cat);
    const y = catValue(lb, cat);
    if (x === null || y === null || Math.abs(x - y) < TIE_EPSILON) out.ties++;
    else if (x > y !== cat.low) out.a++;
    else out.b++;
  }
  return out;
}

/** One row per week that has both managers' totals, grouped by the calendar month the week starts in. */
export function teammateReport(scores: LeagueState["scores"], duo: Duo, weekCount: number): TeammateReport {
  const months = new Map<string, TeammateMonth>();
  const total: Split = { a: 0, b: 0, ties: 0 };
  for (let week = 1; week <= weekCount; week++) {
    const split = compareWeek(scores, week, duo);
    if (!split) continue;
    const label = new Date(weekBounds(week)[0]).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const month = months.get(label) ?? { label, weeks: [], total: { a: 0, b: 0, ties: 0 } };
    month.weeks.push({ week, ...split });
    addTo(month.total, split);
    addTo(total, split);
    months.set(label, month);
  }
  return { months: [...months.values()], total };
}
