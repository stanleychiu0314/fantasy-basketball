import { describe, expect, it } from "vitest";
import { parseDay, parseLeague, type EspnLeague } from "@/lib/espn";

describe("parseDay", () => {
  it("keeps one day's actual stats and marks bench players inactive", () => {
    const raw: EspnLeague = {
      teams: [
        {
          id: 3,
          roster: {
            entries: [
              {
                playerId: 1, lineupSlotId: 0,
                playerPoolEntry: { player: { id: 1, fullName: "Starter", stats: [
                  { scoringPeriodId: 10, statSourceId: 0, statSplitTypeId: 5, stats: { "0": 30, "6": 10, "13": 12, "14": 20 } },
                  { scoringPeriodId: 10, statSourceId: 1, statSplitTypeId: 5, stats: { "0": 99 } },
                ] } },
              },
              {
                playerId: 2, lineupSlotId: 12,
                playerPoolEntry: { player: { id: 2, fullName: "Bench", stats: [
                  { scoringPeriodId: 10, statSourceId: 0, statSplitTypeId: 5, stats: { "0": 8 } },
                ] } },
              },
              { playerId: 4, lineupSlotId: 0, playerPoolEntry: { player: { id: 4, fullName: "Rested", stats: [] } } },
            ],
          },
        },
      ],
    };
    const days = parseDay(raw, 10);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ playerId: 1, active: true, teamId: 3 });
    expect(days[0].stats).toMatchObject({ pts: 30, reb: 10, fgm: 12, fga: 20, blk: 0 });
    expect(days[1]).toMatchObject({ playerId: 2, active: false });
  });
});

describe("parseLeague", () => {
  it("reads weekly team totals from matchup scoreByStat", () => {
    const snap = parseLeague({
      status: { currentMatchupPeriod: 2, latestScoringPeriod: 8 },
      teams: [{ id: 1, name: "A" }],
      schedule: [{ matchupPeriodId: 1, home: { teamId: 1, cumulativeScore: { scoreByStat: { "0": { score: 500 }, "11": { score: 60 } } } } }],
    });
    expect(snap.stats[1][1]).toMatchObject({ pts: 500, to: 60 });
    expect(snap.currentWeek).toBe(2);
    expect(snap.latestDay).toBe(8);
  });
});
