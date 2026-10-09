import type { Duo, LeagueState } from "@/types/league";
import { duoSubtitle, formatValue, matchup } from "@/lib/scoring";

const HALF = 50;
const PERCENT = 100;

type Props = {
  state: Pick<LeagueState, "scores" | "final">;
  week: number;
  A: Duo;
  B: Duo;
  /** Playoff extras: a heading like "Final", and each side's seed. */
  label?: string;
  seedA?: number;
  seedB?: number;
};

const seedTag = (seed?: number) => (seed ? <span className="seed">{seed}</span> : null);

/** One duo-vs-duo matchup with a row per category. Shared by the public site and admin. */
export function MatchupCard({ state, week, A, B, label, seedA, seedB }: Props) {
  const m = matchup(state.scores, week, A, B);
  const win = !m.played ? "" : m.winsA > m.winsB ? "A" : m.winsA < m.winsB ? "B" : "T";
  const status = !m.played
    ? m.partial ? "Waiting on one side" : "Not scored"
    : state.final[week] ? "Final" : null;

  return (
    <article className={`mc${m.played ? "" : " idle"}${label ? " po" : ""}`}>
      {label && <p className="mc-label">{label}</p>}
      <header className="mc-head">
        <div className={`side A${win === "A" ? " win" : ""}`}><h3>{seedTag(seedA)}{A.name}</h3><p>{duoSubtitle(A)}</p></div>
        <div className="score">
          <div className="sc"><span>{m.played ? m.winsA : "–"}</span><i>-</i><span>{m.played ? m.winsB : "–"}</span></div>
          <small>
            {m.ties ? `${m.ties} tied · ` : ""}
            {status ?? <span className="state live"><span className="dot" />Live</span>}
          </small>
        </div>
        <div className={`side B${win === "B" ? " win" : ""}`}><h3>{seedTag(seedB)}{B.name}</h3><p>{duoSubtitle(B)}</p></div>
      </header>
      {m.cats.map((c) => {
        const total = (c.a ?? 0) + (c.b ?? 0);
        const shareA = total > 0 && c.a !== null && c.b !== null ? Math.round((c.a / total) * PERCENT) : HALF;
        const markA = c.winner === 1 ? " w" : c.winner === 0 ? " t" : "";
        const markB = c.winner === -1 ? " w" : c.winner === 0 ? " t" : "";
        return (
          <div key={c.cat.key} className="cr">
            <span className={`v a${markA}`}>{m.played ? formatValue(c.cat, c.a) : "–"}</span>
            <span className="cl">
              <b>{c.cat.label}</b>
              <span className="bar">
                <i className={c.winner === 1 ? "on" : ""} style={{ width: `${shareA}%` }} />
                <i className={c.winner === -1 ? "on" : ""} style={{ width: `${PERCENT - shareA}%` }} />
              </span>
            </span>
            <span className={`v b${markB}`}>{m.played ? formatValue(c.cat, c.b) : "–"}</span>
          </div>
        );
      })}
    </article>
  );
}

/** Placeholder for a playoff game whose teams are not known yet. */
export function PendingCard({ label, a, b, note }: { label: string; a: string; b: string; note: string }) {
  return (
    <article className="mc idle po">
      <p className="mc-label">{label}</p>
      <header className="mc-head">
        <div className="side A"><h3>{a}</h3></div>
        <div className="score"><div className="sc"><span>{"–"}</span><i>-</i><span>{"–"}</span></div></div>
        <div className="side B"><h3>{b}</h3></div>
      </header>
      <p className="note" style={{ padding: "0 16px 16px" }}>{note}</p>
    </article>
  );
}
