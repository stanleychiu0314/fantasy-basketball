import { describe, expect, it } from "vitest";
import { detectTeammateMoves } from "@/lib/trades";
import { defaultConfig } from "@/lib/season";

const config = defaultConfig();
config.duos[0] = { ...config.duos[0], espnA: 1, espnB: 2 };
config.duos[1] = { ...config.duos[1], espnA: 3, espnB: 4 };

describe("detectTeammateMoves", () => {
  it("flags a player moving between duo partners", () => {
    const moves = detectTeammateMoves(config, { 1: [{ id: 99, name: "Jokic" }], 2: [] }, { 1: [], 2: [{ id: 99, name: "Jokic" }] });
    expect(moves).toEqual([{ id: "99:1:2", playerId: 99, playerName: "Jokic", fromMember: "d1a", toMember: "d1b" }]);
  });

  it("ignores trades with other duos", () => {
    expect(detectTeammateMoves(config, { 1: [{ id: 5, name: "X" }], 3: [] }, { 1: [], 3: [{ id: 5, name: "X" }] })).toEqual([]);
  });

  it("does nothing on the first sync", () => {
    expect(detectTeammateMoves(config, undefined, { 1: [{ id: 5, name: "X" }] })).toEqual([]);
  });
});
