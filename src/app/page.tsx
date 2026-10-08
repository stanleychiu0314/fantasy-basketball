import { LeagueApp } from "@/components/LeagueApp";
import { loadLeagueState } from "@/lib/league";

// Scores change during the week, so render on every request.
export const dynamic = "force-dynamic";

// Next.js requires a default export for pages.
export default async function Home() {
  const state = await loadLeagueState();
  return <LeagueApp state={state} />;
}
