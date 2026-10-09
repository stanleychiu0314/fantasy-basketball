import type { Duo, LeagueState } from "@/types/league";
import { computeStandings, matchup, pairsFor, type StandingRow } from "@/lib/scoring";

type State = Pick<LeagueState, "config" | "scores" | "final">;

export const PLAYOFF_SPOTS = 4;

/** One game on the weekly schedule. A side is null when the bracket has not decided it yet. */
export type Game = {
  label: string;
  a: Duo | null;
  b: Duo | null;
  /** Seeds, playoff games only. */
  seedA?: number;
  seedB?: number;
  winner: Duo | null;
  loser: Duo | null;
};

export type Bracket = {
  semisWeek: number;
  finalsWeek: number;
  /** Top four of the regular season, best first. Provisional until the regular season ends. */
  seeds: Duo[];
  /** Who the 1st seed faces in the semis, whether picked or defaulted to the 4th seed. */
  seed1Opponent: Duo | null;
  seed1Picked: boolean;
  semis: Game[];
  /** Seeds 5 and 6, played in the semifinals week. The loser finishes last. */
  lastPlace: Game;
  final: Game;
  thirdPlace: Game;
  /** Places 1 to 6, best first. Each slot is null until it is decided or projected. */
  placements: (Duo | null)[];
  /** Whether placements come from finished playoff games or from the current table. */
  decided: boolean;
  regularRows: StandingRow[];
};

/**
 * Play one playoff game. A 4-4-1 tie is not allowed to stand in the playoffs,
 * so the higher seed advances.
 */
function playGame(state: State, week: number, label: string, a: Duo | null, b: Duo | null, seedOf: Map<string, number>): Game {
  const game: Game = { label, a, b, seedA: a ? seedOf.get(a.id) : undefined, seedB: b ? seedOf.get(b.id) : undefined, winner: null, loser: null };
  if (!a || !b) return game;
  const m = matchup(state.scores, week, a, b);
  // A playoff game only crowns a winner once its week is final; until then it is live.
  if (!m.played || !state.final[week]) return game;
  const aWins = m.winsA > m.winsB || (m.winsA === m.winsB && (game.seedA ?? 99) < (game.seedB ?? 99));
  game.winner = aWins ? a : b;
  game.loser = aWins ? b : a;
  return game;
}

/** Seed the top four, build the semis around the 1st seed's pick, then the final and 3rd place game. */
export function computeBracket(state: State): Bracket {
  const { regularWeeks, seed1Pick } = state.config;
  const semisWeek = regularWeeks + 1;
  const finalsWeek = regularWeeks + 2;
  const { rows, lastPlayed } = computeStandings(state);
  const seeds = rows.slice(0, PLAYOFF_SPOTS).map((r) => r.duo);
  // Seeds run 1 to 6: the top four play for the title, 5 and 6 play for last place.
  const seedOf = new Map(rows.map((r, i) => [r.duo.id, i + 1]));
  const hasTable = lastPlayed > 0;

  const picked = hasTable ? seeds.slice(1).find((d) => d.id === seed1Pick) ?? null : null;
  const seed1Opponent = hasTable ? picked ?? seeds[3] : null;
  const others = hasTable ? seeds.slice(1).filter((d) => d !== seed1Opponent) : [];

  const semis = [
    playGame(state, semisWeek, "Semifinal", hasTable ? seeds[0] : null, seed1Opponent, seedOf),
    playGame(state, semisWeek, "Semifinal", others[0] ?? null, others[1] ?? null, seedOf),
  ];
  const lastPlace = playGame(state, semisWeek, "Last place game", hasTable ? rows[4]?.duo ?? null : null, hasTable ? rows[5]?.duo ?? null : null, seedOf);
  const final = playGame(state, finalsWeek, "Final", semis[0].winner, semis[1].winner, seedOf);
  const thirdPlace = playGame(state, finalsWeek, "3rd place game", semis[0].loser, semis[1].loser, seedOf);

  const decided = !!final.winner && !!thirdPlace.winner && !!lastPlace.winner;
  const placements: (Duo | null)[] = decided
    ? [final.winner, final.loser, thirdPlace.winner, thirdPlace.loser, lastPlace.winner, lastPlace.loser]
    : rows.map((r) => (hasTable ? r.duo : null));

  return { semisWeek, finalsWeek, seeds, seed1Opponent, seed1Picked: !!picked, semis, lastPlace, final, thirdPlace, placements, decided, regularRows: rows };
}

export const isPlayoffWeek = (state: Pick<LeagueState, "config">, week: number) => week > state.config.regularWeeks;

/** Short name for a week: "Semifinals", "Finals" or empty for the regular season. */
export function weekLabel(state: Pick<LeagueState, "config">, week: number): string {
  if (week === state.config.regularWeeks + 1) return "Semifinals";
  if (week === state.config.regularWeeks + 2) return "Finals";
  return "";
}

/** Every game scheduled in a week: the round robin in the regular season, the bracket in the playoffs. */
export function gamesForWeek(state: State, week: number, bracket = computeBracket(state)): Game[] {
  if (week === bracket.semisWeek) return [...bracket.semis, bracket.lastPlace];
  if (week === bracket.finalsWeek) return [bracket.final, bracket.thirdPlace];
  const byId = new Map(state.config.duos.map((d) => [d.id, d]));
  return pairsFor(state, week).map(([x, y]) => {
    const a = byId.get(x) ?? null;
    const b = byId.get(y) ?? null;
    return { label: "", a, b, winner: null, loser: null };
  });
}

export function weekHasData(state: State, week: number): boolean {
  return gamesForWeek(state, week).some((g) => !!g.a && !!g.b && matchup(state.scores, week, g.a, g.b).played);
}
