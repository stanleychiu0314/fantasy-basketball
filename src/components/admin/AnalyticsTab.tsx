import { seasonReport } from "@/lib/analytics";
import { myGame, openWeeks, type AnalyticsContext } from "@/lib/analytics-context";
import { loadTrades } from "@/lib/snapshots";
import { teammateReport } from "@/lib/teammates";
import { AnalyticsOverview } from "./AnalyticsView";

/** Loads the trade snapshot and builds the overview from an already-loaded analytics context. */
export async function AnalyticsTab({ ctx }: { ctx: AnalyticsContext }) {
  const { state, me, info, ready } = ctx;
  const weeks = openWeeks(state).map((week, i) => ({ week, when: i === 0 ? "This week" : "Next week", game: myGame(state, me, week) }));
  const teammates = teammateReport(state.scores, me, state.config.weeks);
  if (!ready) return <AnalyticsOverview me={me} info={info} weeks={weeks} teammates={teammates} analysis={null} />;

  const trades = await loadTrades(ctx);
  return (
    <AnalyticsOverview
      me={me}
      info={info}
      weeks={weeks}
      teammates={teammates}
      analysis={{
        season: seasonReport(state.config.duos, ready.rosters, ready.rated, me),
        trades: trades?.data ?? [],
        tradesAsOf: trades?.computedAt.toISOString() ?? null,
      }}
    />
  );
}
