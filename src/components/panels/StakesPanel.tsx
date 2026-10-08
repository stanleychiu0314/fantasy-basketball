import type { LeagueState } from "@/types/league";
import { duoSubtitle, type Standings } from "@/lib/scoring";
import { CountUp } from "../CountUp";

type Props = { state: LeagueState; standings: Standings };

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
const LEVELS = [1, 2, 3];

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n)}`;

/** Payouts and punishments, with whoever currently holds each place. */
export function StakesPanel({ state, standings }: Props) {
  const { buyIn, duos, punishments, weeks } = state.config;
  const players = duos.length * 2;
  const pool = players * buyIn;
  const refund = 2 * buyIn;
  const firstEach = (pool - refund) / 2;

  const slots = [
    { n: 1, title: "Champions", net: firstEach - buyIn, text: `Split the $${pool - refund} prize. Each manager takes home ${money(firstEach)}.`, level: 0 },
    { n: 2, title: "Money back", net: 0, text: "Buy-in returned. Nothing won, nothing lost.", level: 0 },
    { n: 3, title: "Out of the money", net: -buyIn, text: "Buy-in gone. No punishment.", level: 0 },
    ...(["4", "5", "6"] as const).map((k) => ({
      n: Number(k), title: punishments[k].title, net: -buyIn, text: punishments[k].text, level: punishments[k].level,
    })),
  ];

  return (
    <>
      <div>
        <h2 className="h2">What&apos;s on the line</h2>
        <p className="lede">
          Everyone puts in ${buyIn}. Rankings after Week {weeks} (ends Apr 11) decide who eats, who breaks even, and who pays for it.
        </p>
      </div>
      <div className="pot">
        <div className="card"><span className="eyebrow">Total pot</span><span className="big"><CountUp value={pool} prefix="$" /></span><span className="note">{players} managers x ${buyIn}</span></div>
        <div className="card"><span className="eyebrow">First place</span><span className="big"><CountUp value={pool - refund} prefix="$" /></span><span className="note">Split by 2 managers</span></div>
        <div className="card"><span className="eyebrow">Refunded</span><span className="big"><CountUp value={refund} prefix="$" /></span><span className="note">Second place gets it back</span></div>
      </div>
      <div className="slots">
        {slots.map((s) => {
          const row = standings.rows[s.n - 1];
          const sub = row ? duoSubtitle(row.duo) : "";
          return (
            <div key={s.n} className={`slot s${s.n}`}>
              <span className="pos">{ORDINAL[s.n]}</span>
              <div className="who">
                {!standings.lastPlayed || !row ? (
                  <><span style={{ color: "var(--muted)" }}>To be decided</span><small>Fills in after the first week is scored</small></>
                ) : (
                  <>{row.duo.name}{sub && <small>{sub}</small>}</>
                )}
              </div>
              <div className={`pay ${s.net > 0 ? "plus" : s.net < 0 ? "minus" : ""}`}>
                <span className="big">{s.net > 0 ? "+" : ""}{money(s.net)}</span>
                <small>net per manager</small>
              </div>
              <div className="what">
                <b>{s.title}</b>
                {s.level > 0 && (
                  <span className="pips" title={`Punishment level ${s.level} of 3`}>
                    {LEVELS.map((i) => <i key={i} className={i <= s.level ? "on" : ""} />)}
                  </span>
                )}
                <br />
                {s.text}
              </div>
            </div>
          );
        })}
      </div>
      <p className="note">
        Placement is live. Whoever sits in each spot right now is shown, and it can change every week until the season ends.
      </p>
    </>
  );
}
