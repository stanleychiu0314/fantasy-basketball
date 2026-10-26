import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { weekReport } from "@/lib/analytics";
import { playersWithStatsOn, playerWeek } from "@/lib/league";
import { emptyLine } from "@/lib/scoring";
import { gameDayAt } from "@/lib/season";
import { managerGames, managersOf, rosterRows, topDrafted, weekWindow } from "@/lib/week-view";
import { WeekView } from "@/components/admin/WeekView";
import { LoginForm } from "@/components/admin/LoginForm";
import { loadAnalyticsContext, ME, myGame, openWeeks, played } from "@/lib/analytics-context";
import { loadWeekMoves } from "@/lib/snapshots";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners matchup", robots: { index: false } };

// Next.js requires a default export for pages.
export default async function WeekPage({ params }: PageProps<"/admin/analytics/week/[week]">) {
  if (!(await isAdmin())) return <LoginForm />;
  const week = Number((await params).week);
  const today = gameDayAt();
  const [ctx, playedToday] = await Promise.all([loadAnalyticsContext(), playersWithStatsOn(today)]);
  const { state, me, ready } = ctx;
  // Only this week and next week are open for now; anything else goes back to the admin home.
  const open = openWeeks(state);
  if (!open.includes(week)) redirect("/admin");
  const when = week === open[0] ? "This week" : "Next week";

  const game = myGame(state, me, week);
  const base = { me, week, when, label: game?.label ?? "" };
  if (!ready || !game) return <WeekView {...base} started={false} data={null} />;

  const { rated, rosters, meta, gameDays } = ready;
  const { opponent } = game;
  const { window, started } = weekWindow(week, meta, gameDays, { playedToday });
  const now = { mine: started ? played(state, week, me) : emptyLine(), theirs: started ? played(state, week, opponent) : emptyLine() };
  // The live matchup projection is cheap; the free-agent search comes from the saved snapshot.
  const report = weekReport({ duos: state.config.duos, rosters, rated, me, opponent, window, freeAgents: [], playedMine: now.mine, playedTheirs: now.theirs });
  const [moves, rows] = await Promise.all([loadWeekMoves(week, ctx), playerWeek(week)]);

  // The window drops today's games already played; for "plays today" those still count.
  const playsToday = started ? (id: number) => playedToday.has(id) || (window.playsOn?.(id, today) ?? false) : null;
  // Pills show each star's games over the whole week, not just what is left.
  const wholeWeek = weekWindow(week, meta, gameDays, { full: true }).window;
  const sides = [me, opponent].map((duo) => {
    const managers = managerGames(managersOf(duo, ME), rows, rosters, rated, window);
    const roster = managers.flatMap((m) => (m.team === null ? [] : (rosters[m.team] ?? [])));
    return { duo, managers, stars: topDrafted(roster, meta, rated, wholeWeek.gamesOf) };
  });
  const boxes = sides.flatMap(({ duo, managers }) =>
    managers.map((m) => ({
      manager: m.name,
      duo: duo.name,
      rows: rosterRows({ roster: m.team === null ? [] : (rosters[m.team] ?? []), rows, member: m.key, meta, gamesLeft: window.gamesOf, playsToday }),
    })),
  );
  const [stanley, adam] = sides[0].managers;
  const scores = state.scores[week] ?? {};
  const teammates = { me: stanley, mate: adam, mine: scores[stanley.key] ?? null, theirs: scores[adam.key] ?? null };

  return <WeekView {...base} started={started} data={{ report, now, games: [sides[0], sides[1]], moves, boxes, teammates }} />;
}
