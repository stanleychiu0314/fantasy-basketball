import type { PlayerMeta, RatedPlayer } from "@/lib/analytics";
import type { NbaGame } from "@/lib/espn";

/** A team with this many games in the window is worth streaming from. */
export const STREAM_MIN_GAMES = 4;
/** Opponents ranked 21-30 (the 10 worst defenses by points allowed) are favorable. */
export const FAVORABLE_MIN_RANK = 21;
/** Opponents ranked 1-10 (the 10 best defenses) are unfavorable. */
export const UNFAVORABLE_MAX_RANK = 10;
const DEFAULT_LIMIT = 15;
const OUT = "OUT";

export type StreamingReport = {
  /** NBA teams with 4+ games in the window, most games first, then most favorable. */
  teams: { proTeamId: number; abbrev: string; games: number; favorable: number; unfavorable: number }[];
  /** Free agents worth streaming, best first. */
  candidates: { playerId: number; name: string; abbrev: string; games: number; favorable: number; unfavorable: number; value: number }[];
};

type TeamGames = Map<number, { day: number; opponent: number | null }[]>;

/** Each NBA team's games in day order, the shape buildStreaming reads. */
export function gamesByTeam(games: NbaGame[]): TeamGames {
  const out: TeamGames = new Map();
  for (const g of [...games].sort((a, b) => a.day - b.day)) {
    out.set(g.proTeamId, [...(out.get(g.proTeamId) ?? []), { day: g.day, opponent: g.opponentProTeamId }]);
  }
  return out;
}

/**
 * True when every team has an abbreviation and every game an opponent. Schedule rows
 * stored before migration 0003 have neither, which makes streaming blank and all zeros.
 */
export const scheduleComplete = (games: TeamGames, abbrevs: Map<number, string>) =>
  games.size > 0 && [...games].every(([id, list]) => abbrevs.has(id) && list.every((g) => g.opponent !== null));

type Slate = { games: number; favorable: number; unfavorable: number };

/**
 * Which NBA teams play the most in a window and against which defenses, and the
 * free agents who benefit most. Pure: callers load the schedule, defense and ratings.
 */
export function buildStreaming(args: {
  days: number[];
  games: TeamGames;
  defenseRank: Map<number, number>;
  abbrevs: Map<number, string>;
  rated: Map<number, RatedPlayer>;
  meta: Map<number, PlayerMeta>;
  freeAgents: number[];
  limit?: number;
}): StreamingReport {
  const { days, games, defenseRank, abbrevs, rated, meta, freeAgents, limit = DEFAULT_LIMIT } = args;
  const inWindow = new Set(days);
  const slates = new Map<number, Slate>();
  for (const [proTeamId, list] of games) {
    const slate: Slate = { games: 0, favorable: 0, unfavorable: 0 };
    for (const g of list) {
      if (!inWindow.has(g.day)) continue;
      slate.games++;
      // An unknown opponent or a missing rank counts as neither favorable nor unfavorable.
      const rank = g.opponent === null ? undefined : defenseRank.get(g.opponent);
      if (rank === undefined) continue;
      if (rank >= FAVORABLE_MIN_RANK) slate.favorable++;
      else if (rank <= UNFAVORABLE_MAX_RANK) slate.unfavorable++;
    }
    slates.set(proTeamId, slate);
  }
  const abbrevOf = (id: number) => abbrevs.get(id) ?? "";

  const teams = [...slates]
    .filter(([, s]) => s.games >= STREAM_MIN_GAMES)
    .map(([proTeamId, s]) => ({ proTeamId, abbrev: abbrevOf(proTeamId), ...s }))
    .sort((a, b) => b.games - a.games || b.favorable - a.favorable);

  const net = (s: Slate) => s.favorable - s.unfavorable;
  const candidates = freeAgents
    .flatMap((playerId) => {
      const player = rated.get(playerId);
      const m = meta.get(playerId);
      const slate = m && slates.get(m.proTeamId);
      if (!player || !m || m.injuryStatus === OUT || !slate?.games) return [];
      return [{ playerId, name: player.name, abbrev: abbrevOf(m.proTeamId), ...slate, value: player.value }];
    })
    .sort((a, b) => b.games - a.games || net(b) - net(a) || b.value - a.value)
    .slice(0, limit);

  return { teams, candidates };
}
