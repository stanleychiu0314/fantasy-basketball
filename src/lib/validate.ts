import type { LeagueConfig, StatLine } from "@/types/league";
import { FIELDS } from "@/lib/scoring";

const MAX_TEXT = 200;
const MAX_WEEKS = 30;
const MAX_BUY_IN = 10_000;
const MAX_STAT = 100_000;

const text = (v: unknown, fallback = ""): string => (typeof v === "string" ? v.slice(0, MAX_TEXT) : fallback);
const int = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const teamId = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

/**
 * Server actions are reachable by anyone who can POST, so every value from
 * the admin page is reshaped here before it touches the database.
 */
export function cleanConfig(input: LeagueConfig, current: LeagueConfig): LeagueConfig {
  const duoIds = new Set(current.duos.map((d) => d.id));
  const schedule: LeagueConfig["schedule"] = {};
  for (const [week, pairs] of Object.entries(input.schedule ?? {})) {
    if (!Array.isArray(pairs)) continue;
    schedule[String(int(Number(week), 1, MAX_WEEKS, 1))] = pairs
      .filter((p) => Array.isArray(p) && duoIds.has(p[0]) && duoIds.has(p[1]))
      .map((p) => [p[0], p[1]] as [string, string]);
  }
  return {
    name: text(input.name, current.name) || current.name,
    buyIn: int(input.buyIn, 0, MAX_BUY_IN, current.buyIn),
    weeks: int(input.weeks, 1, MAX_WEEKS, current.weeks),
    currentWeekOverride: input.currentWeekOverride === null ? null : int(input.currentWeekOverride, 1, MAX_WEEKS, 1),
    duos: current.duos.map((d) => {
      const next = input.duos?.find((x) => x.id === d.id);
      if (!next) return d;
      return { id: d.id, name: text(next.name, d.name), a: text(next.a, d.a), b: text(next.b, d.b), espnA: teamId(next.espnA), espnB: teamId(next.espnB) };
    }),
    punishments: (["4", "5", "6"] as const).reduce(
      (acc, k) => ({
        ...acc,
        [k]: {
          title: text(input.punishments?.[k]?.title, current.punishments[k].title),
          text: text(input.punishments?.[k]?.text, current.punishments[k].text),
          level: current.punishments[k].level,
        },
      }),
      {} as LeagueConfig["punishments"],
    ),
    schedule,
    manualRosters: current.manualRosters,
  };
}

export function cleanStats(input: StatLine): StatLine {
  return FIELDS.reduce((acc, f) => ({ ...acc, [f]: int(input?.[f], 0, MAX_STAT, 0) }), {} as StatLine);
}
