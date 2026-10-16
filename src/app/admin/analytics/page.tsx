import type { Metadata } from "next";
import { isAdmin } from "@/lib/auth";
import { readConfig } from "@/lib/league";
import { loadPlayerInputs } from "@/lib/projections";
import { buildReport, ratePlayers } from "@/lib/analytics";
import { AnalyticsView } from "@/components/admin/AnalyticsView";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gooners analytics", robots: { index: false } };

/** The duo shown when none is picked: the one Stanley is in. */
const DEFAULT_MANAGER = "Stanley";

// Next.js requires a default export for pages.
export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  if (!(await isAdmin())) return <LoginForm />;
  const [{ config, espnCache }, { players, sources, updatedAt }, params] = await Promise.all([readConfig(), loadPlayerInputs(), searchParams]);
  const picked = typeof params.duo === "string" ? params.duo : null;
  const duo =
    config.duos.find((d) => d.id === picked) ?? config.duos.find((d) => d.a === DEFAULT_MANAGER || d.b === DEFAULT_MANAGER) ?? config.duos[0];
  const ready = players.length > 0 && !!espnCache?.rosters;
  const report = ready ? buildReport(config.duos, espnCache!.rosters, ratePlayers(players), duo.id) : null;
  return (
    <AnalyticsView
      duos={config.duos}
      duoId={duo.id}
      report={report}
      sources={sources}
      updatedAt={updatedAt?.toISOString() ?? null}
      playerCount={players.length}
      gamesPlayed={players.reduce((n, p) => Math.max(n, p.actual?.gp ?? 0), 0)}
    />
  );
}
