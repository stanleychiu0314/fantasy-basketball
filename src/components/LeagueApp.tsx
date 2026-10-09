"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeagueState } from "@/types/league";
import { computeStandings } from "@/lib/scoring";
import { computeBracket, weekHasData, weekLabel } from "@/lib/playoffs";
import { weekRange } from "@/lib/season";
import { RulesPanel } from "./panels/RulesPanel";
import { StakesPanel } from "./panels/StakesPanel";
import { StandingsPanel } from "./panels/StandingsPanel";
import { WeeklyPanel } from "./panels/WeeklyPanel";
import { RostersPanel } from "./panels/RostersPanel";
import { PlayoffsPanel } from "./panels/PlayoffsPanel";

const TABS = [
  ["rules", "Rules"],
  ["stakes", "Stakes"],
  ["standings", "Standings"],
  ["weekly", "Weekly"],
  ["playoffs", "Playoffs"],
  ["rosters", "Rosters"],
] as const;
type TabId = (typeof TABS)[number][0];

/** How often an open page asks the server for fresh scores. */
const REFRESH_MS = 2 * 60_000;

const isTab = (v: string): v is TabId => TABS.some(([id]) => id === v);

/** The public league site: header, tab bar and the five sheets. */
export function LeagueApp({ state }: { state: LeagueState }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("standings");
  const [week, setWeek] = useState(state.currentWeek);
  const standings = useMemo(() => computeStandings(state), [state]);
  const bracket = useMemo(() => computeBracket(state), [state]);
  const phase = weekLabel(state, state.currentWeek);
  const live = weekHasData(state, state.currentWeek) && !state.final[state.currentWeek];

  useEffect(() => {
    const syncFromHash = () => {
      const fromHash = window.location.hash.slice(1);
      if (isTab(fromHash)) setTab(fromHash);
    };
    // The hash only exists in the browser, so it can only be read after hydration.
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const open = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };
  const goToWeek = (w: number) => {
    setWeek(w);
    open("weekly");
    window.scrollTo({ top: 0 });
  };

  const words = state.config.name.split(" ");
  const last = words.pop();
  const synced = state.lastSynced ? new Date(state.lastSynced) : null;

  return (
    <>
      <div className="wrap">
        <header className="top">
          <div>
            <p className="eyebrow">Fantasy basketball</p>
            <h1>
              {words.length ? `${words.join(" ")} ` : ""}
              <span>{last}</span>
            </h1>
            <p className="sub">
              2026-27 season, Oct 20 to Apr 11. {state.config.duos.length * 2} managers, {state.config.duos.length} duos, 9
              categories, ${state.config.buyIn} buy-in.
            </p>
          </div>
          <div className="pills">
            <span className={`pill${live ? " live" : ""}`}>
              {live && <span className="dot" />}
              {live ? "Live " : ""}{phase ? `${phase} · ` : ""}Week {state.currentWeek} of {state.config.weeks} · {weekRange(state.currentWeek)}
            </span>
            <span className="sync" suppressHydrationWarning>
              {state.espnStatus === "ok" && synced
                ? `ESPN synced ${synced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : state.espnStatus === "private"
                  ? "ESPN league is private"
                  : "Waiting on ESPN"}
            </span>
          </div>
        </header>

        <nav className="nav" aria-label="Sheets">
          <div className="nav-in" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => open(id)}>
                {label}
              </button>
            ))}
          </div>
        </nav>

        <main key={tab} className="panel enter" role="tabpanel">
          {tab === "rules" && <RulesPanel state={state} />}
          {tab === "stakes" && <StakesPanel state={state} bracket={bracket} />}
          {tab === "standings" && <StandingsPanel state={state} standings={standings} onWeek={goToWeek} />}
          {tab === "weekly" && <WeeklyPanel state={state} week={week} onWeek={setWeek} />}
          {tab === "playoffs" && <PlayoffsPanel state={state} bracket={bracket} onWeek={goToWeek} />}
          {tab === "rosters" && <RostersPanel state={state} />}
        </main>
        <p className="foot">
          Scores come from ESPN and refresh every few minutes. Percentages are always computed from made and attempted
          shots, never averaged. <a className="admin-link" href="/admin">Commissioner</a>
        </p>
      </div>
    </>
  );
}
