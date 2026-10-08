import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { loadLeagueState, recentScoreEdits } from "@/lib/league";
import { AdminApp } from "@/components/admin/AdminApp";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners admin", robots: { index: false } };

// Next.js requires a default export for pages.
export default async function AdminPage() {
  if (!(await isAdmin())) return <LoginForm />;
  const [state, edits] = await Promise.all([loadLeagueState(), recentScoreEdits()]);
  return <AdminApp state={state} edits={edits} />;
}
