import { NextResponse } from "next/server";
import { syncFromEspn } from "@/lib/league";
import { refreshProjections } from "@/lib/projections";
import { loadAnalyticsContext, openWeeks } from "@/lib/analytics-context";
import { computeTrades, computeWeekMoves } from "@/lib/snapshots";
import { isMondayUtc } from "@/lib/snapshot-rules";

export const dynamic = "force-dynamic";

type StepResult = { ok: boolean; message: string };

/** Run one cron step so a throw becomes a failed result instead of stopping the others. */
async function step(run: () => Promise<StepResult>): Promise<StepResult> {
  try {
    const { ok, message } = await run();
    return { ok, message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Step failed" };
  }
}

/**
 * Daily 10:00 UTC run by Vercel Cron, so finished weeks are saved even if nobody
 * opens the site. It refreshes projections, saves trade ideas, and on Mondays saves
 * this week's and next week's moves. Vercel sends CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const startedAt = new Date();
  const [result, projections] = await Promise.all([step(syncFromEspn), step(refreshProjections)]);
  // Loaded after the sync so the snapshots see fresh rosters, projections and the current week.
  const ctx = await loadAnalyticsContext().catch(() => null);
  const trades = ctx ? await step(() => computeTrades(ctx)) : { ok: false, message: "Could not load analytics data" };
  const weekMoves: Record<number, StepResult> = {};
  if (ctx && isMondayUtc(startedAt)) {
    for (const week of openWeeks(ctx.state, startedAt.getTime())) weekMoves[week] = await step(() => computeWeekMoves(week, ctx));
  }
  // The status tracks the sync and projections as before; snapshot steps report in the body.
  return NextResponse.json({ ...result, projections, trades, weekMoves }, { status: result.ok && projections.ok ? 200 : 502 });
}
