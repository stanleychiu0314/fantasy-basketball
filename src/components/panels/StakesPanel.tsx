import type { LeagueState } from "@/types/league";
import { duoSubtitle, memberKeys } from "@/lib/scoring";
import type { Bracket } from "@/lib/playoffs";
import { PUNISHED_PLACES, PUNISHMENTS, weekRange } from "@/lib/season";
import { CountUp } from "../CountUp";

type Props = { state: LeagueState; bracket: Bracket };

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
/** The whole pot goes to the top two duos: two thirds to 1st, one third to 2nd ($160 and $80 at a $20 buy-in). */
const FIRST_SHARE = 2 / 3;
const MANAGERS_PER_DUO = 2;

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n)}`;

/** Payouts and punishments, with whoever currently holds each place. */
export function StakesPanel({ state, bracket }: Props) {
  const { buyIn, duos, punishmentPicks, weeks } = state.config;
  const pickOf = (place: (typeof PUNISHED_PLACES)[number]) => PUNISHMENTS.find((p) => p.id === punishmentPicks[place]);
  const pickedBy = (id: string) => PUNISHED_PLACES.find((place) => punishmentPicks[place] === id);
  const players = duos.length * 2;
  const pool = players * buyIn;
  const firstPrize = Math.round(pool * FIRST_SHARE);
  const secondPrize = pool - firstPrize;
  const firstEach = firstPrize / MANAGERS_PER_DUO;
  const secondEach = secondPrize / MANAGERS_PER_DUO;

  const slots = [
    { n: 1, title: "Champions", net: firstEach - buyIn, text: `Split the $${firstPrize} prize. Each manager takes home ${money(firstEach)}.` },
    { n: 2, title: "Runners-up", net: secondEach - buyIn, text: `Split the $${secondPrize} prize. Each manager takes home ${money(secondEach)}.` },
    { n: 3, title: "Out of the money", net: -buyIn, text: "Buy-in gone. No punishment." },
    ...PUNISHED_PLACES.map((place, i) => {
      const picked = pickOf(place);
      return {
        n: Number(place),
        title: picked ? `Punishment: ${picked.title}` : `Picks a punishment ${ORDINAL[i + 1]}`,
        net: -buyIn,
        text: picked ? picked.text : "Hasn't picked yet. Both managers do the punishment.",
      };
    }),
  ];

  return (
    <>
      <div>
        <h2 className="h2">What&apos;s on the line</h2>
        <p className="lede">
          Everyone puts in ${buyIn}. The playoffs decide who gets paid and who pays for it: the final settles 1st and 2nd, the 3rd place game settles 3rd and 4th, and the last place game between seeds 5 and 6 settles who finishes last. Everything is settled after Week {weeks} ({weekRange(weeks)}).
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
          const duo = bracket.placements[s.n - 1];
          const sub = duo ? duoSubtitle(duo) : "";
          return (
            <div key={s.n} className={`slot s${s.n}`}>
              <span className="pos">{ORDINAL[s.n]}</span>
              <div className="who">
                {!duo ? (
                  <><span style={{ color: "var(--muted)" }}>To be decided</span><small>Fills in after the first week is scored</small></>
                ) : (
                  <>{duo.name}{sub && <small>{sub}</small>}</>
                )}
              </div>
              <div className={`pay ${s.net > 0 ? "plus" : s.net < 0 ? "minus" : ""}`}>
                <span className="big">{s.net > 0 ? "+" : ""}{money(s.net)}</span>
                <small>net per manager</small>
              </div>
              <div className="what">
                <b>{s.title}</b>
                <br />
                {s.text}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <p className="eyebrow">Punishment pool</p>
        <p className="note" style={{ marginTop: 6 }}>
          4th place picks first, then 5th, then 6th. Both managers in the duo do it. Anything not picked goes unused.
        </p>
        <ul className="clean" style={{ color: "var(--fg)" }}>
          {PUNISHMENTS.map((p) => {
            const by = pickedBy(p.id);
            return (
              <li key={p.id} style={by ? { opacity: 0.55 } : undefined}>
                <b>{p.title}</b>{by ? <span className="tag hi" style={{ marginLeft: 8 }}>Taken by {ORDINAL[Number(by)]}</span> : null}
                <br />{p.text}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="note">
        {bracket.decided
          ? "Final placement. The season is over."
          : "Until the playoffs finish, each spot shows the regular-season standings right now. It can change every week."}
      </p>
    </>
  );
}
