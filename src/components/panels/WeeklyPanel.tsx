import type { LeagueState } from "@/types/league";
import { pairsFor, weekHasData } from "@/lib/scoring";
import { weekRange } from "@/lib/season";
import { MatchupCard } from "../MatchupCard";
import { WeekChips } from "../WeekChips";

type Props = { state: LeagueState; week: number; onWeek: (w: number) => void };

/** The three duo matchups for one week. */
export function WeeklyPanel({ state, week, onWeek }: Props) {
  const byId = new Map(state.config.duos.map((d) => [d.id, d]));
  const status = state.final[week] ? "Final" : weekHasData(state, week) ? "Live" : "Not started";
  return (
    <>
      <div>
        <h2 className="h2">Weekly matchups</h2>
        <p className="lede">Pick a week to see its three duo matchups. Numbers come straight from ESPN.</p>
      </div>
      <WeekChips weeks={state.config.weeks} current={state.currentWeek} selected={week} final={state.final} onPick={onWeek} />
      <div className="wbar">
        <span className="eyebrow">
          Week {week} · {weekRange(week)}{week === state.currentWeek ? " · current" : ""} · {status}
        </span>
      </div>
      <div key={week} className="mcs enter">
        {pairsFor(state, week).map(([a, b]) => {
          const A = byId.get(a);
          const B = byId.get(b);
          return A && B ? <MatchupCard key={`${a}-${b}`} state={state} week={week} A={A} B={B} /> : null;
        })}
      </div>
    </>
  );
}
