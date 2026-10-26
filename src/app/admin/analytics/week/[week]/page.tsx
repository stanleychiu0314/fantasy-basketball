import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { weekReport } from "@/lib/analytics";
import { emptyLine } from "@/lib/scoring";
import { WeekMatchup } from "@/components/admin/AnalyticsView";
import { LoginForm } from "@/components/admin/LoginForm";
import { loadAnalyticsContext, myGame, openWeeks, played, weekWindow } from "@/lib/analytics-context";
import { loadWeekMoves } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners matchup", robots: { index: false } };

// Next.js requires a default export for pages.
export default async function WeekPage({ params }: PageProps<"/admin/analytics/week/[week]">) {
  if (!(await isAdmin())) return <LoginForm />;
  const week = Number((await params).week);
  const ctx = await loadAnalyticsContext();
  const { state, me, ready } = ctx;
  // Only this week and next week are open for now; anything else goes back to the overview.
  const open = openWeeks(state);
  if (!open.includes(week)) redirect("/admin/analytics");
  const when = week === open[0] ? "This week" : "Next week";

  const game = myGame(state, me, week);
  if (!ready || !game) return <WeekMatchup me={me} week={week} when={when} label={game?.label ?? ""} report={null} started={false} asOf={null} />;

  const { rated, rosters, meta, gameDays } = ready;
  const { window, started } = weekWindow(week, meta, gameDays);
  // The live matchup projection is cheap; the free-agent search comes from the saved snapshot.
  const live = weekReport({
    duos: state.config.duos, rosters, rated, me, opponent: game.opponent, window, freeAgents: [],
    playedMine: started ? played(state, week, me) : emptyLine(),
    playedTheirs: started ? played(state, week, game.opponent) : emptyLine(),
  });
  const moves = await loadWeekMoves(week, ctx);
  const report = { ...live, pickups: moves?.data.pickups ?? [], targets: moves?.data.targets ?? [] };
  const asOf = moves?.computedAt.toISOString() ?? null;
  return <WeekMatchup me={me} week={week} when={when} label={game.label} report={report} started={started} asOf={asOf} />;
}
