"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, logIn, logOut } from "@/lib/auth";
import { dismissTradeAlert, readConfig, saveManualStats, setPaid, setWeekFinal, syncFromEspn, writeConfig } from "@/lib/league";
import { cleanConfig, cleanStats } from "@/lib/validate";
import type { LeagueConfig, StatLine } from "@/types/league";

const MEMBER_KEY = /^d[1-6][ab]$/;
const MAX_WEEK = 30;

export type ActionResult = { ok: boolean; message: string };

/** Every action re-checks the session; the page check alone is not enough. */
async function guard(): Promise<ActionResult | null> {
  return (await isAdmin()) ? null : { ok: false, message: "Your session expired. Log in again." };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin");
}

export async function loginAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ok = await logIn(String(form.get("password") ?? ""));
  if (!ok) return { ok: false, message: process.env.ADMIN_PASSWORD ? "Wrong password." : "ADMIN_PASSWORD is not set on the server." };
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await logOut();
  redirect("/");
}

export async function saveConfigAction(input: LeagueConfig): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const { config } = await readConfig();
  await writeConfig(cleanConfig(input, config));
  refresh();
  return { ok: true, message: "Saved" };
}

export async function syncAction(): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const r = await syncFromEspn();
  refresh();
  return r;
}

export async function saveStatsAction(week: number, member: string, stats: StatLine | null): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK || !MEMBER_KEY.test(member)) {
    return { ok: false, message: "That week or team does not exist." };
  }
  await saveManualStats(week, member, stats === null ? null : cleanStats(stats));
  if (stats === null) await syncFromEspn().catch(() => undefined);
  refresh();
  return { ok: true, message: stats === null ? "Back to ESPN numbers" : "Saved" };
}

export async function setFinalAction(week: number, final: boolean): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!Number.isInteger(week) || week < 1 || week > MAX_WEEK) return { ok: false, message: "That week does not exist." };
  await setWeekFinal(week, final);
  refresh();
  return { ok: true, message: final ? "Week marked final" : "Week reopened" };
}

export async function setPaidAction(member: string, paid: boolean): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!MEMBER_KEY.test(member)) return { ok: false, message: "That manager does not exist." };
  await setPaid(member, paid);
  refresh();
  return { ok: true, message: paid ? "Marked paid" : "Marked unpaid" };
}

export async function dismissTradeAlertAction(id: string): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!/^\d+:\d+:\d+$/.test(id)) return { ok: false, message: "Unknown alert." };
  await dismissTradeAlert(id);
  refresh();
  return { ok: true, message: "Alert dismissed" };
}
