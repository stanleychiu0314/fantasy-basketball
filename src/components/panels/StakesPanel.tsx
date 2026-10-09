import type { LeagueState } from "@/types/league";
import { duoSubtitle, memberKeys, type Standings } from "@/lib/scoring";
import { CountUp } from "../CountUp";

type Props = { state: LeagueState; standings: Standings };

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
const LEVELS = [1, 2, 3];
/** The whole pot goes to the top two duos: two thirds to 1st, one third to 2nd ($160 and $80 at a $20 buy-in). */
const FIRST_SHARE = 2 / 3;
const MANAGERS_PER_DUO = 2;

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n)}`;

/** Payouts and punishments, with whoever currently holds each place. */
export function StakesPanel({ state, standings }: Props) {
  const { buyIn, duos, punishments, weeks } = state.config;
  const players = duos.length * 2;
  const pool = players * buyIn;
  const firstPrize = Math.round(pool * FIRST_SHARE);
  const secondPrize = pool - firstPrize;
  const firstEach = firstPrize / MANAGERS_PER_DUO;
  const secondEach = secondPrize / MANAGERS_PER_DUO;

  const slots = [
    { n: 1, title: "Champions", net: firstEach - buyIn, text: `Split the $${firstPrize} prize. Each manager takes home ${money(firstEach)}.`, level: 0 },
    { n: 2, title: "Runners-up", net: secondEach - buyIn, text: `Split the $${secondPrize} prize. Each manager takes home ${money(secondEach)}.`, level: 0 },
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
          Everyone puts in ${buyIn}. Rankings after Week {weeks} (ends Apr 11) decide who gets paid and who pays for it.
        </p>
      </div>
      <div className="pot">
        <div className="card"><span className="eyebrow">Total pot</span><span className="big"><CountUp value={pool} prefix="$" /></span><span className="note">{players} managers x ${buyIn}</span></div>
        <div className="card"><span className="eyebrow">First place</span><span className="big"><CountUp value={firstPrize} prefix="$" /></span><span className="note">{money(firstEach)} per manager</span></div>
        <div className="card"><span className="eyebrow">Second place</span><span className="big"><CountUp value={secondPrize} prefix="$" /></span><span className="note">{money(secondEach)} per manager</span></div>
      </div>
      <div className="card">
        <p className="eyebrow">
          Buy-ins · {Object.values(state.paid).filter(Boolean).length} of {players} paid
        </p>
        <div className="paid-list">
          {duos.flatMap((d) =>
            memberKeys(d).map((key, i) => (
              <span key={key} className={`tag${state.paid[key] ? " paid" : ""}`}>
                {state.paid[key] ? "\u2713 " : ""}{i ? d.b : d.a}
              </span>
            )),
          )}
        </div>
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
