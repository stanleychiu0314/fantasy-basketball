import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { weekReport } from "@/lib/analytics";
import { emptyLine } from "@/lib/scoring";
import { WeekMatchup } from "@/components/admin/AnalyticsView";
import { LoginForm } from "@/components/admin/LoginForm";
import { loadAnalyticsContext, myGame, openWeeks, played, weekWindow } from "../../context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners matchup", robots: { index: false } };

// Next.js requires a default export for pages.
export default async function WeekPage({ params }: PageProps<"/admin/analytics/week/[week]">) {
  if (!(await isAdmin())) return <LoginForm />;
  const week = Number((await params).week);
  const { state, me, ready } = await loadAnalyticsContext();
  // Only this week and next week are open for now; anything else goes back to the overview.
  const open = openWeeks(state);
  if (!open.includes(week)) redirect("/admin/analytics");
  const when = week === open[0] ? "This week" : "Next week";

  const game = myGame(state, me, week);
  if (!ready || !game) return <WeekMatchup me={me} week={week} when={when} label={game?.label ?? ""} report={null} started={false} />;

  const { rated, rosters, meta, gameDays, freeAgents } = ready;
  const { window, started } = weekWindow(week, meta, gameDays);
  const report = weekReport({
    duos: state.config.duos, rosters, rated, me, opponent: game.opponent, window, freeAgents,
    playedMine: started ? played(state, week, me) : emptyLine(),
    playedTheirs: started ? played(state, week, game.opponent) : emptyLine(),
  });
  return <WeekMatchup me={me} week={week} when={when} label={game.label} report={report} started={started} />;
}
