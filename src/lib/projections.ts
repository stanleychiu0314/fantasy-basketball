import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fetchPlayerPool } from "@/lib/espn";
import type { PlayerInput } from "@/lib/analytics";

const ESPN_PROJECTION = "espn";
const ESPN_ACTUAL = "espn-actual";

/**
 * Pull every player's ESPN season projection and actual stats so far, and store
 * both. Re-running it is how projections get refined: actual games pile up and
 * the blend in analytics.ts leans on them more.
 */
export async function refreshProjections(): Promise<{ ok: boolean; message: string }> {
  if (!db) return { ok: false, message: "No database connected" };
  const r = await fetchPlayerPool();
  if (r.status !== "ok") return { ok: false, message: r.message };
  const rows = r.data.flatMap((p) => [
    ...(p.projection ? [{ source: ESPN_PROJECTION, kind: "projection" as const, playerId: p.playerId, playerName: p.name, line: p.projection }] : []),
    ...(p.actual ? [{ source: ESPN_ACTUAL, kind: "actual" as const, playerId: p.playerId, playerName: p.name, line: p.actual }] : []),
  ]);
  if (rows.length) {
    await db
      .insert(schema.playerProjections)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.playerProjections.source, schema.playerProjections.playerId],
        set: { playerName: sql`excluded.player_name`, line: sql`excluded.line`, updatedAt: new Date() },
      });
  }
  const actuals = r.data.filter((p) => p.actual).length;
  return { ok: true, message: `Stored projections for ${r.data.filter((p) => p.projection).length} players (${actuals} with games played)` };
}

/** Every stored player, with all projection sources and his actual line, ready for ratePlayers. */
export async function loadPlayerInputs(): Promise<{ players: PlayerInput[]; sources: string[]; updatedAt: Date | null }> {
  if (!db) return { players: [], sources: [], updatedAt: null };
  const rows = await db.select().from(schema.playerProjections);
  const byPlayer = new Map<number, PlayerInput>();
  let updatedAt: Date | null = null;
  for (const r of rows) {
    const p = byPlayer.get(r.playerId) ?? { playerId: r.playerId, name: r.playerName, projections: [], actual: null };
    if (r.kind === "actual") p.actual = r.line;
    else p.projections.push(r.line);
    byPlayer.set(r.playerId, p);
    if (!updatedAt || r.updatedAt > updatedAt) updatedAt = r.updatedAt;
  }
  const sources = [...new Set(rows.filter((r) => r.kind === "projection").map((r) => r.source))];
  return { players: [...byPlayer.values()], sources, updatedAt };
}
