import { describe, expect, it } from "vitest";
import type { GameWindow, PlayerMeta, RatedPlayer } from "@/lib/analytics";
import { CATS, emptyLine, FIELDS } from "@/lib/scoring";
import { formatDiff, gamesPlayed, leadOf, managerGames, managersOf, rosterRows, topDrafted, weekWindow } from "@/lib/week-view";
import type { Duo, PlayerWeek } from "@/types/league";

const duo: Duo = { id: "d1", name: "Smashing Balls", a: "Adam", b: "Stanley", espnA: 2, espnB: 1 };
const cat = (key: string) => CATS.find((c) => c.key === key)!;
const row = (playerId: number, member: string, games: number): PlayerWeek => ({ ...emptyLine(), pts: 10 * games, playerId, name: `P${playerId}`, member, games });
const rated = (playerId: number, value: number): RatedPlayer => ({
  playerId, name: `P${playerId}`, value, z: {}, actualGames: 0,
  perGame: Object.fromEntries(FIELDS.map((f) => [f, 1])) as RatedPlayer["perGame"],
});

describe("managersOf", () => {
  it("puts the named manager first and keeps member keys tied to ESPN teams", () => {
    expect(managersOf(duo, "Stanley")).toEqual([
      { name: "Stanley", key: "d1b", team: 1 },
      { name: "Adam", key: "d1a", team: 2 },
    ]);
    expect(managersOf(duo).map((m) => m.key)).toEqual(["d1a", "d1b"]);
  });
});

describe("games per manager", () => {
  const rows = [row(1, "d1b", 3), row(2, "d1b", 2), row(3, "d1a", 4)];

  it("counts games played per member", () => {
    expect(gamesPlayed(rows, "d1b")).toBe(5);
    expect(gamesPlayed(rows, "d9a")).toBe(0);
  });

  it("projects games left from each manager's own lineup and skips IR and unmapped teams", () => {
    const window: GameWindow = { gamesOf: () => 2, cap: 100 };
    const rosters = { 1: [{ id: 1, name: "P1" }, { id: 2, name: "P2", ir: true }], 2: [{ id: 3, name: "P3" }] };
    const ratings = new Map([[1, rated(1, 5)], [2, rated(2, 4)], [3, rated(3, 3)]]);
    const out = managerGames([...managersOf(duo, "Stanley"), { name: "Nobody", key: "d2a", team: null }], rows, rosters, ratings, window);
    expect(out.map((m) => [m.name, m.played, m.left])).toEqual([["Stanley", 5, 2], ["Adam", 4, 2], ["Nobody", 0, 0]]);
  });
});

describe("leadOf", () => {
  it("higher wins for normal categories, lower wins for turnovers", () => {
    expect(leadOf(cat("pts"), 100, 90)).toBe(1);
    expect(leadOf(cat("pts"), 80, 90)).toBe(-1);
    expect(leadOf(cat("to"), 10, 12)).toBe(1);
    expect(leadOf(cat("to"), 14, 12)).toBe(-1);
  });

  it("is a tie when equal and unknown when a side has no value", () => {
    expect(leadOf(cat("fg"), 0.5, 0.5)).toBe(0);
    expect(leadOf(cat("fg"), null, 0.5)).toBeNull();
  });
});

describe("formatDiff", () => {
  it("signs counts and percentages in their own format", () => {
    expect(formatDiff(cat("pts"), 110, 98)).toBe("+12");
    expect(formatDiff(cat("to"), 10, 12)).toBe("-2");
    expect(formatDiff(cat("fg"), 0.45, 0.484)).toBe("-.034");
  });

  it("shows an even difference without a sign, and a dash when a side is missing", () => {
    expect(formatDiff(cat("pts"), 50, 50)).toBe("0");
    expect(formatDiff(cat("ft"), 0.8, 0.8)).toBe(".000");
    expect(formatDiff(cat("ft"), null, 0.8)).toBe("–");
  });
});

describe("rosterRows", () => {
  const meta = new Map([[1, { proTeamId: 1, injuryStatus: "OUT", onTeamId: 1, draftPick: null, adp: null }]]);
  const base = {
    roster: [{ id: 1, name: "P1" }, { id: 2, name: "P2", ir: true }, { id: 4, name: "P4" }],
    rows: [row(4, "d1b", 2), row(5, "d1b", 1), row(4, "d1a", 1)],
    member: "d1b",
    meta,
    gamesLeft: () => 3,
  };

  it("tags IR and OUT, gives IR no games, and adds dropped players who played", () => {
    const out = rosterRows({ ...base, playsToday: (id) => id !== 4 });
    expect(out.map((r) => [r.playerId, r.tag, r.played, r.left, r.today])).toEqual([
      [1, "OUT", 0, 3, true],
      [2, "IR", 0, 0, false],
      [4, null, 2, 3, false],
      [5, "Dropped", 1, 0, false],
    ]);
    expect(out[2].line?.pts).toBe(20);
    expect(out[0].line).toBeNull();
  });

  it("leaves today unknown before the week starts", () => {
    expect(rosterRows({ ...base, playsToday: null }).every((r) => r.today === null)).toBe(true);
  });
});

describe("weekWindow", () => {
  // Week 2 is Mon Oct 26 (game day 7) to Sun Nov 1 (day 13). Team 1 plays days 7 and 9.
  const meta = new Map<number, PlayerMeta>([
    [1, { proTeamId: 1, injuryStatus: "ACTIVE", onTeamId: 1, draftPick: 1, adp: null }],
    [2, { proTeamId: 1, injuryStatus: "ACTIVE", onTeamId: 1, draftPick: 2, adp: null }],
    [3, { proTeamId: 1, injuryStatus: "OUT", onTeamId: 1, draftPick: 3, adp: null }],
  ]);
  const gameDays = new Map([[1, new Set([7, 9])]]);
  const mondayNight = Date.UTC(2026, 9, 27, 1, 0); // 9 PM EDT Monday, already Tuesday in UTC
  const playedToday = new Set([1]);

  it("counts today's games for players who have not played yet, using New York's date", () => {
    const { window, started } = weekWindow(2, meta, gameDays, { now: mondayNight, playedToday });
    expect(started).toBe(true);
    expect(window.days).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(window.gamesOf(1)).toBe(1);
    expect(window.gamesOf(2)).toBe(2);
    expect(window.gamesOf(3)).toBe(0);
  });

  it("counts the whole week before it starts, and with full", () => {
    const sunday = Date.UTC(2026, 9, 25, 16, 0);
    expect(weekWindow(2, meta, gameDays, { now: sunday }).started).toBe(false);
    expect(weekWindow(2, meta, gameDays, { now: sunday }).window.gamesOf(1)).toBe(2);
    expect(weekWindow(2, meta, gameDays, { now: mondayNight, playedToday, full: true }).window.gamesOf(1)).toBe(2);
  });

  it("drops days already gone and leaves nothing once the week is over", () => {
    const wednesday = Date.UTC(2026, 9, 28, 16, 0);
    expect(weekWindow(2, meta, gameDays, { now: wednesday }).window.gamesOf(2)).toBe(1);
    expect(weekWindow(2, meta, gameDays, { now: Date.UTC(2026, 10, 3) }).window.days).toEqual([]);
  });
});

describe("topDrafted", () => {
  const pickMeta = (draftPick: number | null): PlayerMeta => ({ proTeamId: 1, injuryStatus: "ACTIVE", onTeamId: 1, draftPick, adp: null });
  it("orders by draft pick, undrafted last, ties by value, and keeps the top few", () => {
    const roster = [1, 2, 3, 4].map((id) => ({ id, name: `P${id}` }));
    const meta = new Map([[1, pickMeta(30)], [2, pickMeta(null)], [3, pickMeta(4)], [4, pickMeta(null)]]);
    const ratings = new Map([[2, rated(2, 1)], [4, rated(4, 9)]]);
    expect(topDrafted(roster, meta, ratings, (id) => id, 3)).toEqual([
      { playerId: 3, name: "P3", games: 3 },
      { playerId: 1, name: "P1", games: 1 },
      { playerId: 4, name: "P4", games: 4 },
    ]);
  });
});
