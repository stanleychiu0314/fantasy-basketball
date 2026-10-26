import { describe, expect, it } from "vitest";
import type { PlayerMeta, RatedPlayer } from "@/lib/analytics";
import { parseNbaDefense, parseNbaSchedule, type EspnProSchedule, type EspnStandings } from "@/lib/espn";
import { buildStreaming, gamesByTeam, scheduleComplete } from "@/lib/streaming";

const rated = (playerId: number, value: number): RatedPlayer => ({ playerId, name: `P${playerId}`, perGame: {} as RatedPlayer["perGame"], value, z: {}, actualGames: 0 });
const meta = (proTeamId: number, injuryStatus = "ACTIVE"): PlayerMeta => ({ proTeamId, injuryStatus, onTeamId: null, draftPick: null, adp: null });
const slate = (...pairs: [number, number][]) => pairs.map(([day, opponent]) => ({ day, opponent }));

describe("buildStreaming", () => {
  // Team 1: 4 games, two vs soft defense (rank 25), one vs tough (rank 3). Team 2: 4 games, all soft.
  // Team 3: 3 games in the window plus one outside it.
  const games = new Map([
    [1, slate([1, 30], [2, 30], [3, 5], [4, 9])],
    [2, slate([1, 30], [2, 30], [3, 30], [4, 30])],
    [3, slate([1, 9], [2, 9], [3, 9], [9, 9])],
  ]);
  const defenseRank = new Map([[30, 25], [5, 3], [9, 15]]);
  const abbrevs = new Map([[1, "AAA"], [2, "BBB"], [3, "CCC"]]);
  const base = { days: [1, 2, 3, 4, 5, 6, 7], games, defenseRank, abbrevs };

  it("lists 4-game teams with favorable and unfavorable counts, most favorable first", () => {
    const r = buildStreaming({ ...base, rated: new Map(), meta: new Map(), freeAgents: [] });
    expect(r.teams).toEqual([
      { proTeamId: 2, abbrev: "BBB", games: 4, favorable: 4, unfavorable: 0 },
      { proTeamId: 1, abbrev: "AAA", games: 4, favorable: 2, unfavorable: 1 },
    ]);
  });

  it("ranks free agents by games, then matchup, then value, and skips OUT players", () => {
    const r = buildStreaming({
      ...base,
      rated: new Map([[10, rated(10, 5)], [11, rated(11, 1)], [12, rated(12, 9)], [13, rated(13, 20)], [14, rated(14, 2)]]),
      meta: new Map([[10, meta(1)], [11, meta(2)], [12, meta(3)], [13, meta(2, "OUT")], [14, meta(2)]]),
      freeAgents: [10, 11, 12, 13, 14],
    });
    expect(r.candidates.map((c) => c.playerId)).toEqual([14, 11, 10, 12]);
    expect(r.candidates[0]).toMatchObject({ abbrev: "BBB", games: 4, favorable: 4, unfavorable: 0, value: 2 });
  });

  it("caps the candidate list", () => {
    const r = buildStreaming({ ...base, rated: new Map([[10, rated(10, 5)], [11, rated(11, 1)]]), meta: new Map([[10, meta(1)], [11, meta(2)]]), freeAgents: [10, 11], limit: 1 });
    expect(r.candidates).toHaveLength(1);
  });
});

describe("gamesByTeam and scheduleComplete", () => {
  it("groups games per team in day order", () => {
    const g = gamesByTeam([{ proTeamId: 1, day: 5, opponentProTeamId: 2 }, { proTeamId: 1, day: 3, opponentProTeamId: 4 }]);
    expect(g.get(1)).toEqual([{ day: 3, opponent: 4 }, { day: 5, opponent: 2 }]);
  });

  it("is incomplete without abbreviations or opponents, as rows stored before migration 0003 are", () => {
    const games = new Map([[1, [{ day: 3, opponent: 4 }]]]);
    expect(scheduleComplete(games, new Map([[1, "NY"]]))).toBe(true);
    expect(scheduleComplete(games, new Map())).toBe(false);
    expect(scheduleComplete(new Map([[1, [{ day: 3, opponent: null }]]]), new Map([[1, "NY"]]))).toBe(false);
    expect(scheduleComplete(new Map(), new Map())).toBe(false);
  });
});

describe("parseNbaSchedule", () => {
  it("reads the opponent from whichever side is not this team and drops the free agent team", () => {
    // Shape copied from ESPN's proTeamSchedules_wl response.
    const raw: EspnProSchedule = {
      settings: {
        proTeams: [
          { id: 12, abbrev: "LAC", proGamesByScoringPeriod: {
            "2": [{ awayProTeamId: 23, homeProTeamId: 12 }],
            "4": [{ awayProTeamId: 12, homeProTeamId: 13 }],
            "5": [],
          } },
          { id: 0, abbrev: "FA", proGamesByScoringPeriod: {} },
        ],
      },
    };
    const { games, abbrevs } = parseNbaSchedule(raw);
    expect(games).toEqual([
      { proTeamId: 12, day: 2, opponentProTeamId: 23 },
      { proTeamId: 12, day: 4, opponentProTeamId: 13 },
    ]);
    expect([...abbrevs]).toEqual([[12, "LAC"]]);
  });
});

describe("parseNbaDefense", () => {
  it("ranks by points allowed per game, mapping site teams to fantasy ids by abbreviation", () => {
    // Shape copied from site.api.espn.com standings: conferences -> entries -> stats.
    const entry = (abbreviation: string, avgPointsAgainst: number) => ({
      team: { abbreviation },
      stats: [{ name: "avgPointsFor", value: 110 }, { name: "avgPointsAgainst", value: avgPointsAgainst }],
    });
    const raw: EspnStandings = {
      children: [
        { standings: { entries: [entry("NY", 108), entry("MIL", 129)] } },
        { standings: { entries: [entry("OKC", 96.33), entry("XXX", 90)] } },
      ],
    };
    const d = parseNbaDefense(raw, new Map([[18, "NY"], [15, "MIL"], [25, "OKC"]]));
    expect([...d]).toEqual([
      [25, { pointsAllowed: 96.33, rank: 1 }],
      [18, { pointsAllowed: 108, rank: 2 }],
      [15, { pointsAllowed: 129, rank: 3 }],
    ]);
  });
});
