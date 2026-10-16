import { NextResponse } from "next/server";
import { syncFromEspn } from "@/lib/league";
import { refreshProjections } from "@/lib/projections";

export const dynamic = "force-dynamic";

/**
 * Daily backup sync run by Vercel Cron, so finished weeks are saved even if
 * nobody opens the site. It also refreshes player projections, which refines
 * them with the latest actual stats. Vercel sends CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const [result, projections] = await Promise.all([syncFromEspn(), refreshProjections()]);
  return NextResponse.json({ ...result, projections }, { status: result.ok && projections.ok ? 200 : 502 });
}
