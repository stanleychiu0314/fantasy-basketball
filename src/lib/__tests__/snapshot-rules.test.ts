import { describe, expect, it } from "vitest";
import type { Pickup, RatedPlayer } from "@/lib/analytics";
import { CATS } from "@/lib/scoring";
import { filterStillAvailable, isMondayUtc, TRADES_KEY, weekMovesKey, type WeekMoves } from "@/lib/snapshot-rules";

const player = (playerId: number): RatedPlayer => ({ playerId, name: `P${playerId}`, perGame: {} as RatedPlayer["perGame"], value: 1, z: {}, actualGames: 0 });
const pickup = (add: number): Pickup => ({ add: player(add), addGames: 3, drop: null, dropFrom: "Stanley", weekGain: 0.5, seasonGain: 0, stream: false });
const candidate = (playerId: number) => ({ playerId, name: `P${playerId}`, abbrev: "NY", games: 4, favorable: 1, unfavorable: 0, value: 1 });

describe("filterStillAvailable", () => {
  const moves: WeekMoves = {
    pickups: [pickup(1), pickup(2)],
    targets: [{ cat: CATS[0], winChance: 0.3, players: [{ player: player(1), games: 3 }, { player: player(3), games: 2 }] }],
    streaming: { teams: [{ proTeamId: 18, abbrev: "NY", games: 4, favorable: 1, unfavorable: 0 }], candidates: [candidate(2), candidate(3)] },
  };

  it("drops players now on any roster from pickups, targets and streaming", () => {
    const r = filterStillAvailable(moves, { 1: [{ id: 1, name: "P1" }], 7: [{ id: 2, name: "P2", ir: true }] });
    expect(r.pickups).toEqual([]);
    expect(r.targets[0].players.map((x) => x.player.playerId)).toEqual([3]);
    expect(r.streaming?.candidates.map((c) => c.playerId)).toEqual([3]);
    expect(r.streaming?.teams).toHaveLength(1);
  });

  it("keeps everything when rosters are unknown, and keeps a null streaming report", () => {
    expect(filterStillAvailable(moves, undefined)).toEqual(moves);
    expect(filterStillAvailable({ ...moves, streaming: null }, {}).streaming).toBeNull();
  });
});

describe("snapshot keys and schedule", () => {
  it("builds keys", () => {
    expect(weekMovesKey(5)).toBe("week_moves:5");
    expect(TRADES_KEY).toBe("trades");
  });

  it("detects Monday in UTC, not local time", () => {
    expect(isMondayUtc(new Date("2026-10-26T10:00:00Z"))).toBe(true);
    // Sunday evening in New York is already Monday in UTC.
    expect(isMondayUtc(new Date("2026-10-26T02:00:00Z"))).toBe(true);
    expect(isMondayUtc(new Date("2026-10-25T23:59:59Z"))).toBe(false);
    expect(isMondayUtc(new Date("2026-10-27T10:00:00Z"))).toBe(false);
  });
});
