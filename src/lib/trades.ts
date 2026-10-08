import type { LeagueConfig, MemberKey } from "@/types/league";
import type { RosterPlayer } from "@/lib/espn";
import { memberKeys } from "@/lib/scoring";

export type TeammateMove = { id: string; playerId: number; playerName: string; fromMember: MemberKey; toMember: MemberKey };

/**
 * Compare two roster snapshots and return every player who went straight from
 * one manager's team to their duo partner's team. A player who was dropped and
 * later picked up by the partner also shows up here; the commissioner decides
 * whether it counts.
 */
export function detectTeammateMoves(
  config: LeagueConfig,
  before: Record<number, RosterPlayer[]> | undefined,
  after: Record<number, RosterPlayer[]>,
): TeammateMove[] {
  if (!before) return [];
  const memberOf = new Map<number, MemberKey>();
  const partnerOf = new Map<MemberKey, MemberKey>();
  for (const d of config.duos) {
    const [ka, kb] = memberKeys(d);
    if (d.espnA !== null) memberOf.set(d.espnA, ka);
    if (d.espnB !== null) memberOf.set(d.espnB, kb);
    partnerOf.set(ka, kb);
    partnerOf.set(kb, ka);
  }
  const previousTeam = new Map<number, number>();
  for (const [teamId, players] of Object.entries(before)) {
    for (const p of players) previousTeam.set(p.id, Number(teamId));
  }
  const moves: TeammateMove[] = [];
  for (const [teamId, players] of Object.entries(after)) {
    const to = Number(teamId);
    for (const p of players) {
      const from = previousTeam.get(p.id);
      if (from === undefined || from === to) continue;
      const fromMember = memberOf.get(from);
      const toMember = memberOf.get(to);
      if (!fromMember || !toMember || partnerOf.get(fromMember) !== toMember) continue;
      moves.push({ id: `${p.id}:${from}:${to}`, playerId: p.id, playerName: p.name, fromMember, toMember });
    }
  }
  return moves;
}
