import { NextResponse } from "next/server";
import { syncFromEspn } from "@/lib/league";

export const dynamic = "force-dynamic";

/**
 * Daily backup sync run by Vercel Cron, so finished weeks are saved even if
 * nobody opens the site. Vercel sends CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const result = await syncFromEspn();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
