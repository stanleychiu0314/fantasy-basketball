"use client";

import { useEffect, useState } from "react";
import type { Duo, LeagueState, PlayerWeek } from "@/types/league";
import { memberKeys, pairsFor, weekHasData } from "@/lib/scoring";
import { weekRange } from "@/lib/season";
import { MatchupCard } from "../MatchupCard";
import { WeekChips } from "../WeekChips";

type Props = { state: LeagueState; week: number; onWeek: (w: number) => void };
type Players = { week: number; rows: PlayerWeek[] } | null;

/** The three duo matchups for one week, plus each duo's player box score. */
export function WeeklyPanel({ state, week, onWeek }: Props) {
  const byId = new Map(state.config.duos.map((d) => [d.id, d]));
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
        <p className="lede">Pick a week to see its three duo matchups. Numbers come straight from ESPN.</p>
      </div>
      <WeekChips weeks={state.config.weeks} current={state.currentWeek} selected={week} final={state.final} onPick={onWeek} />
      <div className="wbar">
        <span className="eyebrow">
          Week {week} · {weekRange(week)}
          {week === state.currentWeek ? " · current" : ""} · {status}
          {corrected ? ` · ${corrected} score${corrected > 1 ? "s" : ""} corrected by the commissioner` : ""}
        </span>
      </div>
      <div key={week} className="mcs enter">
        {pairsFor(state, week).map(([a, b]) => {
          const A = byId.get(a);
          const B = byId.get(b);
          return A && B ? <MatchupCard key={`${a}-${b}`} state={state} week={week} A={A} B={B} /> : null;
        })}
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
