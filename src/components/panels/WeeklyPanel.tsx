"use client";

import { useEffect, useState } from "react";
import type { Duo, LeagueState, PlayerWeek } from "@/types/league";
import { memberKeys } from "@/lib/scoring";
import { gamesForWeek, weekHasData, weekLabel } from "@/lib/playoffs";
import { weekRange } from "@/lib/season";
import { MatchupCard, PendingCard } from "../MatchupCard";
import { WeekChips } from "../WeekChips";

type Props = { state: LeagueState; week: number; onWeek: (w: number) => void };
type Players = { week: number; rows: PlayerWeek[] } | null;

/** The three duo matchups for one week, plus each duo's player box score. */
export function WeeklyPanel({ state, week, onWeek }: Props) {
  const phase = weekLabel(state, week);
  const status = state.final[week] ? "Final" : weekHasData(state, week) ? "Live" : "Not started";
  const corrected = state.manual.filter((m) => m.week === week).length;

  const [players, setPlayers] = useState<Players>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/players?week=${week}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PlayerWeek[]) => !cancelled && setPlayers({ week, rows }))
      .catch(() => !cancelled && setPlayers({ week, rows: [] }));
    return () => {
      cancelled = true;
    };
  }, [week, state.lastSynced]);
  const rows = players?.week === week ? players.rows : null;

  return (
    <>
      <div>
        <h2 className="h2">Weekly matchups</h2>
        <p className="lede">
          Pick a week to see its matchups. Weeks {state.config.regularWeeks + 1} and {state.config.weeks} are the playoffs. Numbers come straight from ESPN.
        </p>
      </div>
      <WeekChips weeks={state.config.weeks} regularWeeks={state.config.regularWeeks} current={state.currentWeek} selected={week} final={state.final} onPick={onWeek} />
      <div className="wbar">
        <span className="eyebrow">
          {phase ? `${phase} · ` : ""}Week {week} · {weekRange(week)}
          {week === state.currentWeek ? " · current" : ""} · {status}
          {corrected ? ` · ${corrected} score${corrected > 1 ? "s" : ""} corrected by the commissioner` : ""}
        </span>
      </div>
      <div key={week} className="mcs enter">
        {gamesForWeek(state, week).map((g, i) =>
          g.a && g.b ? (
            <MatchupCard key={`${g.a.id}-${g.b.id}`} state={state} week={week} A={g.a} B={g.b} label={g.label || undefined} seedA={g.seedA} seedB={g.seedB} />
          ) : (
            <PendingCard
              key={i}
              label={g.label}
              a={g.a?.name ?? (g.label === "Final" ? "Semifinal winner" : g.label === "Semifinal" || g.label === "Last place game" ? "To be seeded" : "Semifinal loser")}
              b={g.b?.name ?? (g.label === "Final" ? "Semifinal winner" : g.label === "Semifinal" || g.label === "Last place game" ? "To be seeded" : "Semifinal loser")}
              note={g.label === "Final" || g.label === "3rd place game" ? "Set once the semifinals are final." : "Set once the regular season ends."}
            />
          ),
        )}
      </div>

      <div>
        <h3 className="h2" style={{ fontSize: "1.7rem" }}>Box scores</h3>
        <p className="note" style={{ marginTop: 4 }}>Players count only on days they were in the active lineup, the same as ESPN.</p>
      </div>
      {rows === null ? (
        <p className="note">Loading players…</p>
      ) : rows.length === 0 ? (
        <p className="note">Player stats appear here once games for this week are played.</p>
      ) : (
        <div className="box">
          {state.config.duos.map((d) => (
            <DuoBox key={d.id} duo={d} rows={rows.filter((r) => memberKeys(d).includes(r.member))} />
          ))}
        </div>
      )}
    </>
  );
}

const pct = (made: number, att: number) => (att > 0 ? (made / att).toFixed(3).replace(/^0/, "") : "–");

/** One duo's players for the week, best scorer first. */
function DuoBox({ duo, rows }: { duo: Duo; rows: PlayerWeek[] }) {
  const sorted = [...rows].sort((x, y) => y.pts - x.pts);
  const manager = (member: string) => (member.endsWith("a") ? duo.a : duo.b);
  return (
    <section className="eb">
      <h4>{duo.name}</h4>
      {sorted.length === 0 ? (
        <p className="note">No games yet.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Player</th><th className="num">G</th><th className="num">PTS</th><th className="num">REB</th>
                <th className="num">AST</th><th className="num">STL</th><th className="num">BLK</th><th className="num">3PM</th>
                <th className="num">TO</th><th className="num">FG%</th><th className="num">FT%</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <tr key={p.playerId} className={i === 0 ? "top" : ""}>
                  <td className="pn">{p.name}<small>{manager(p.member)}</small></td>
                  <td className="num">{p.games}</td>
                  <td className="num">{p.pts}</td>
                  <td className="num">{p.reb}</td>
                  <td className="num">{p.ast}</td>
                  <td className="num">{p.stl}</td>
                  <td className="num">{p.blk}</td>
                  <td className="num">{p.tpm}</td>
                  <td className="num">{p.to}</td>
                  <td className="num">{pct(p.fgm, p.fga)}</td>
                  <td className="num">{pct(p.ftm, p.fta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
