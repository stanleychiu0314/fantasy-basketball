import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { dropCosts, seasonReport } from "@/lib/analytics";
import { AnalyticsOverview } from "@/components/admin/AnalyticsView";
import { LoginForm } from "@/components/admin/LoginForm";
import { loadAnalyticsContext, myGame, openWeeks, weekWindow } from "@/lib/analytics-context";
import { loadTrades } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners analytics", robots: { index: false } };

const STARTERS = 10;

// Next.js requires a default export for pages.
export default async function AnalyticsPage() {
  if (!(await isAdmin())) return <LoginForm />;
  const ctx = await loadAnalyticsContext();
  const { state, me, info, ready } = ctx;
  const weeks = openWeeks(state).map((week, i) => ({ week, when: i === 0 ? "This week" : "Next week", game: myGame(state, me, week) }));
  if (!ready) return <AnalyticsOverview me={me} info={info} weeks={weeks} analysis={null} />;

  const { rated, rosters, meta, gameDays } = ready;
  const { window } = weekWindow(state.currentWeek, meta, gameDays);
  const costs = dropCosts(state.config.duos, rosters, rated, me);
  const roster = (["a", "b"] as const).flatMap((side) => {
    const team = side === "a" ? me.espnA : me.espnB;
    if (team === null) return [];
    const players = (rosters[team] ?? []).flatMap((p) => {
      const r = rated.get(p.id);
      return r ? [{ player: r, manager: me[side], ir: !!p.ir, injury: meta.get(p.id)?.injuryStatus ?? "ACTIVE", games: window.gamesOf(p.id), dropCost: costs.get(p.id) ?? null }] : [];
    });
    const starters = new Set(players.filter((p) => !p.ir).sort((x, y) => y.player.value - x.player.value).slice(0, STARTERS).map((p) => p.player.playerId));
    return players.map((p) => ({ ...p, starter: starters.has(p.player.playerId) }));
  });
  const trades = await loadTrades(ctx);

  return (
    <AnalyticsOverview
      me={me}
      info={info}
      weeks={weeks}
      analysis={{
        season: seasonReport(state.config.duos, rosters, rated, me),
        trades: trades?.data ?? [],
        tradesAsOf: trades?.computedAt.toISOString() ?? null,
        roster,
        currentWeek: state.currentWeek,
      }}
    />
  );
}
