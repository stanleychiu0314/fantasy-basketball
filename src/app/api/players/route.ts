import { NextResponse } from "next/server";
import { playerWeek } from "@/lib/league";

export const dynamic = "force-dynamic";

const MAX_WEEK = 30;
/** Player totals change at most every few minutes, so let the CDN cache briefly. */
const CACHE_HEADER = "public, s-maxage=120, stale-while-revalidate=600";

/** GET /api/players?week=N: every mapped player's totals for that week. Loaded on demand by the Weekly tab. */
export async function GET(request: Request) {
  const week = Number(new URL(request.url).searchParams.get("week"));
  if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK) {
    return NextResponse.json({ error: "week must be a whole number from 1 to 30" }, { status: 400 });
  }
  return NextResponse.json(await playerWeek(week), { headers: { "Cache-Control": CACHE_HEADER } });
}
