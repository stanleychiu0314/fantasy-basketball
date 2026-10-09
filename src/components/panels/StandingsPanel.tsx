"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import type { LeagueState } from "@/types/league";
import { CATS, computeStandings, duoSubtitle, matchup, type Standings } from "@/lib/scoring";
import { gamesForWeek, PLAYOFF_SPOTS, weekLabel } from "@/lib/playoffs";
import { weekRange } from "@/lib/season";

type Props = { state: LeagueState; standings: Standings; onWeek: (w: number) => void };

const LAST_N = 5;
const FLIP_MS = 600;

/** Season table, this week's scoreboard, and the category-wins heat grid. */
export function StandingsPanel({ state, standings, onWeek }: Props) {
  const { rows, lastPlayed } = standings;
  const cw = state.currentWeek;
  const ranked = lastPlayed > 0;

  // Rank as of the previous scored week, for the movement arrows.
  const prevRank = useMemo(() => {
    if (lastPlayed <= 1) return null;
    return new Map(computeStandings(state, lastPlayed - 1).rows.map((r) => [r.duo.id, r.rank]));
  }, [state, lastPlayed]);

  // Slide rows to their new spot when the order changes after a refresh.
  const tableRef = useRef<HTMLDivElement>(null);
  const lastTops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.querySelectorAll<HTMLElement>(".row[data-id]").forEach((row) => {
      const id = row.dataset.id!;
      const top = row.getBoundingClientRect().top;
      const before = lastTops.current.get(id);
      lastTops.current.set(id, top);
      if (reduce || before === undefined || before === top) return;
      row.style.transition = "none";
      row.style.transform = `translateY(${before - top}px)`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          row.style.transition = `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1)`;
          row.style.transform = "";
        }),
      );
    });
  }, [rows]);

  const maxCat = Math.max(1, ...rows.flatMap((r) => CATS.map((c) => r.catWins[c.key])));

  return (
    <>
      <div>
        <h2 className="h2">Standings</h2>
        <p className="lede">
          Regular season, Weeks 1 to {state.config.regularWeeks}. Ranked by matchup record, then category wins. The top {PLAYOFF_SPOTS} make the playoffs.
        </p>
      </div>

      <div>
        <p className="eyebrow" style={{ marginBottom: 8 }}>{weekLabel(state, cw) || `Week ${cw}`} scoreboard · {weekRange(cw)}</p>
        <div className="strip">
          {gamesForWeek(state, cw).map((g) => {
            const A = g.a;
            const B = g.b;
            if (!A || !B) return null;
            const m = matchup(state.scores, cw, A, B);
            return (
              <button key={`${A.id}-${B.id}`} className="mini" onClick={() => onWeek(cw)}>
                <span className={`nm${m.played && m.winsA > m.winsB ? " w" : ""}`}>{A.name}</span>
                <span className="sc">
                  <span>{m.played ? m.winsA : "–"}</span><i>-</i><span>{m.played ? m.winsB : "–"}</span>
                </span>
                <span className={`nm r${m.played && m.winsB > m.winsA ? " w" : ""}`}>{B.name}</span>
                <span className="st">
                  {!m.played ? "Not scored yet" : state.final[cw] ? "Final" : (<span className="state live"><span className="dot" />Live</span>)}
                  {m.ties ? ` · ${m.ties} tied` : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="board" ref={tableRef}>
        <div className="row head">
          <span>#</span><span>Duo</span><span>W-L-T</span><span>Pct</span><span className="hs">Cats</span><span className="hs">Last 5</span>
        </div>
        {rows.map((r) => {
          const prev = prevRank?.get(r.duo.id);
          const delta = prev === undefined ? 0 : prev - r.rank;
          const sub = duoSubtitle(r.duo);
          const cls = (!ranked ? "" : r.rank === 1 ? " top1" : r.rank > PLAYOFF_SPOTS ? " zone" : "") + (r.rank === PLAYOFF_SPOTS ? " cutline" : "");
          return (
            <div key={r.duo.id} className={`row${cls}`} data-id={r.duo.id}>
              <span className="rk">
                {ranked ? r.rank : "-"}
                {ranked && (delta > 0 ? <small className="up">▲{delta}</small> : delta < 0 ? <small className="down">▼{-delta}</small> : <small className="flat">-</small>)}
              </span>
              <span className="nm">{r.duo.name}{sub && <small>{sub}</small>}</span>
              <span className="rec">{r.w}-{r.l}-{r.t}</span>
              <span className="c">{r.played ? r.pct.toFixed(3).replace(/^0/, "") : ".000"}</span>
              <span className="c hs">{r.catW}-{r.catL}-{r.catT}</span>
              <span className="hs">
                {r.results.length ? (
                  <span className="chips">{r.results.slice(-LAST_N).map((x, i) => <i key={i} className={`ch ${x}`}>{x}</i>)}</span>
                ) : (<span className="note">New</span>)}
              </span>
            </div>
          );
        })}
      </div>
      {!ranked && <p className="note">No matchups scored yet. The table fills in once ESPN posts Week 1 stats.</p>}

      <div className="card">
        <p className="eyebrow">Category wins, season to date</p>
        <div className="scroll" style={{ marginTop: 10 }}>
          <div className="heat">
            <div className="hd" style={{ textAlign: "left" }}>Duo</div>
            {CATS.map((c) => <div key={c.key} className="hd">{c.label}</div>)}
            <div className="hd">Total</div>
            {rows.map((r) => (
              <HeatRow key={r.duo.id} name={r.duo.name} wins={CATS.map((c) => r.catWins[c.key])} max={maxCat} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function HeatRow({ name, wins, max }: { name: string; wins: number[]; max: number }) {
  return (
    <>
      <div className="hn">{name}</div>
      {wins.map((v, i) => (
        <div key={i} className={v ? "hot" : ""} style={{ ["--h" as string]: (v / max).toFixed(2) }}>{v}</div>
      ))}
      <div className="tt">{wins.reduce((a, b) => a + b, 0)}</div>
    </>
  );
}
