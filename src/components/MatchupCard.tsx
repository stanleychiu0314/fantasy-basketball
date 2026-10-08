import type { Duo, LeagueState } from "@/types/league";
import { duoSubtitle, formatValue, matchup } from "@/lib/scoring";

const HALF = 50;
const PERCENT = 100;

/** One duo-vs-duo matchup with a row per category. Shared by the public site and admin. */
export function MatchupCard({ state, week, A, B }: { state: Pick<LeagueState, "scores" | "final">; week: number; A: Duo; B: Duo }) {
  const m = matchup(state.scores, week, A, B);
  const win = !m.played ? "" : m.winsA > m.winsB ? "A" : m.winsA < m.winsB ? "B" : "T";
  const status = !m.played
    ? m.partial ? "Waiting on one side" : "Not scored"
    : state.final[week] ? "Final" : null;

  return (
    <article className={`mc${m.played ? "" : " idle"}`}>
      <header className="mc-head">
        <div className={`side A${win === "A" ? " win" : ""}`}><h3>{A.name}</h3><p>{duoSubtitle(A)}</p></div>
        <div className="score">
          <div className="sc"><span>{m.played ? m.winsA : "–"}</span><i>-</i><span>{m.played ? m.winsB : "–"}</span></div>
          <small>
            {m.ties ? `${m.ties} tied · ` : ""}
            {status ?? <span className="state live"><span className="dot" />Live</span>}
          </small>
        </div>
        <div className={`side B${win === "B" ? " win" : ""}`}><h3>{B.name}</h3><p>{duoSubtitle(B)}</p></div>
      </header>
      {m.cats.map((c) => {
        const total = (c.a ?? 0) + (c.b ?? 0);
        const shareA = total > 0 && c.a !== null && c.b !== null ? Math.round((c.a / total) * PERCENT) : HALF;
        const markA = c.winner === 1 ? " w" : c.winner === 0 ? " t" : "";
        const markB = c.winner === -1 ? " w" : c.winner === 0 ? " t" : "";
        return (
          <div key={c.cat.key} className="cr">
            <span className={`v a${markA}`}>{m.played ? formatValue(c.cat, c.a) : "\u2013"}</span>
            <span className="cl">
              <b>{c.cat.label}</b>
              <span className="bar">
                <i className={c.winner === 1 ? "on" : ""} style={{ width: `${shareA}%` }} />
                <i className={c.winner === -1 ? "on" : ""} style={{ width: `${PERCENT - shareA}%` }} />
              </span>
            </span>
            <span className={`v b${markB}`}>{m.played ? formatValue(c.cat, c.b) : "\u2013"}</span>
          </div>
        );
      })}
    </article>
  );
}
