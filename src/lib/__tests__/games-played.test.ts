import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { gamesPlayedSql, playedGame } from "@/lib/games-played";
import { emptyLine, FIELDS } from "@/lib/scoring";

describe("games played", () => {
  it("does not count an all-zero day row (ESPN's line for a DNP) as a game", () => {
    expect(playedGame(emptyLine())).toBe(false);
    expect(playedGame({ ...emptyLine(), reb: 1 })).toBe(true);
    // A scoreless game with only a missed shot still counts.
    expect(playedGame({ ...emptyLine(), fga: 1 })).toBe(true);
  });

  it("counts in SQL only rows whose stats sum above zero, over every stat field", () => {
    const query = new PgDialect().sqlToQuery(gamesPlayedSql()).sql;
    expect(query).toMatch(/^\(count\(\*\) filter \(where .+ > 0\)\)::int$/);
    for (const f of FIELDS) expect(query).toContain(`"${f}"`);
  });
});
