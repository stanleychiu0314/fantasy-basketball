import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { loadLeagueState, recentScoreEdits } from "@/lib/league";
import { loadAnalyticsContext } from "@/lib/analytics-context";
import { AdminSettings } from "@/components/admin/AdminApp";
import { AdminShell, parseTab } from "@/components/admin/AdminShell";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import { CorrectScores } from "@/components/admin/CorrectScoresTab";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners admin", robots: { index: false } };

// Next.js requires a default export for pages.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  if (!(await isAdmin())) return <LoginForm />;
  const tab = parseTab((await searchParams).tab);

  if (tab === "analytics") {
    const ctx = await loadAnalyticsContext();
    return (
      <AdminShell tab={tab} name={ctx.state.config.name} hasDatabase={ctx.state.hasDatabase}>
        <AnalyticsTab ctx={ctx} />
      </AdminShell>
    );
  }

  const [state, edits] = await Promise.all([loadLeagueState(), tab === "scores" ? recentScoreEdits() : []]);
  return (
    <AdminShell tab={tab} name={state.config.name} hasDatabase={state.hasDatabase}>
      {tab === "scores" ? <CorrectScores state={state} edits={edits} /> : <AdminSettings state={state} />}
    </AdminShell>
  );
}
