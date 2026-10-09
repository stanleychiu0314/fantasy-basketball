import type { LeagueState } from "@/types/league";
import { matchup } from "@/lib/scoring";
import { PLAYOFF_SPOTS, type Bracket, type Game } from "@/lib/playoffs";
import { weekRange } from "@/lib/season";

type Props = { state: LeagueState; bracket: Bracket; onWeek: (w: number) => void };

/** The four-duo bracket: semifinals, then the final and the 3rd place game. */
export function PlayoffsPanel({ state, bracket, onWeek }: Props) {
  const { regularWeeks } = state.config;
  const regularDone = !!state.final[regularWeeks];
  const seeded = bracket.seeds.length === PLAYOFF_SPOTS && bracket.regularRows.some((r) => r.played > 0);
  const champion = bracket.final.winner;

  return (
    <>
      <div>
        <h2 className="h2">Playoffs</h2>
        <p className="lede">
          The top {PLAYOFF_SPOTS} duos after Week {regularWeeks} make it. The 1st seed picks its semifinal opponent. Semifinals in
          Week {bracket.semisWeek}, when seeds 5 and 6 also play for last place. The final and the 3rd place game are in Week {bracket.finalsWeek}.
        </p>
      </div>

      {champion && (
        <div className="champ">
          <span className="big">1st</span>
          <div><p className="eyebrow">Champions</p><b style={{ fontSize: "1.2rem" }}>{champion.name}</b></div>
        </div>
      )}

      <div className="card">
        <p className="eyebrow">{regularDone ? "Seeds" : "Seeds if the season ended today"}</p>
        {seeded ? (
          <ol className="clean" style={{ color: "var(--fg)" }}>
            {bracket.seeds.map((d, i) => (
              <li key={d.id}>
                <b>{d.name}</b>
                {i === 0 && <span className="note"> · picks its opponent</span>}
                {i > 0 && d === bracket.seed1Opponent && (
                  <span className="note"> · {bracket.seed1Picked ? "picked by the 1st seed" : "faces the 1st seed unless they pick otherwise"}</span>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="note" style={{ marginTop: 8 }}>Seeds appear once the first week is scored.</p>
        )}
      </div>

      <div className="bracket">
        <div className="round">
          <h3>Semifinals</h3>
          <span className="when">Week {bracket.semisWeek} · {weekRange(bracket.semisWeek)}</span>
          {bracket.semis.map((g, i) => (
            <BracketGame key={i} state={state} week={bracket.semisWeek} game={g} onWeek={onWeek}
              tbd={i === 0 ? ["1st seed", "1st seed's pick"] : ["Seed", "Seed"]} />
          ))}
          <BracketGame state={state} week={bracket.semisWeek} game={bracket.lastPlace} onWeek={onWeek} tbd={["5th seed", "6th seed"]} />
        </div>
        <div className="round">
          <h3>Finals</h3>
          <span className="when">Week {bracket.finalsWeek} · {weekRange(bracket.finalsWeek)}</span>
          <BracketGame state={state} week={bracket.finalsWeek} game={bracket.final} onWeek={onWeek} tbd={["Semifinal winner", "Semifinal winner"]} />
          <BracketGame state={state} week={bracket.finalsWeek} game={bracket.thirdPlace} onWeek={onWeek} tbd={["Semifinal loser", "Semifinal loser"]} />
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Playoff rules</p>
        <ul className="clean">
          <li><b>Seeding:</b> regular-season standings after Week {regularWeeks}, using the normal tiebreakers.</li>
          <li><b>1st seed&apos;s pick:</b> they choose which of seeds 2, 3 or 4 to play. The other two play each other.</li>
          <li><b>Ties:</b> a tied playoff matchup goes to the higher seed.</li>
          <li><b>Final placement:</b> final winner 1st, runner-up 2nd, 3rd place game decides 3rd and 4th, last place game decides 5th and 6th.</li>
        </ul>
      </div>
    </>
  );
}

function BracketGame({ state, week, game, tbd, onWeek }: { state: LeagueState; week: number; game: Game; tbd: [string, string]; onWeek: (w: number) => void }) {
  const m = game.a && game.b ? matchup(state.scores, week, game.a, game.b) : null;
  const side = (duo: Game["a"], seed: number | undefined, wins: number | undefined, fallback: string) => {
    const cls = game.winner && duo ? (duo === game.winner ? " won" : " lost") : "";
    return (
      <div className={`bside${cls}`}>
        <span className="seed">{seed ?? "?"}</span>
        <span className={`nm${duo ? "" : " tbd"}`}>{duo?.name ?? fallback}</span>
        <span className="cw">{m?.played ? wins : "–"}</span>
      </div>
    );
  };
  return (
    <button className="bgame" style={{ textAlign: "left", padding: 0, font: "inherit", color: "inherit" }} onClick={() => onWeek(week)}>
      <p className="lbl">{game.label}{m?.played && !game.winner ? " · live" : ""}</p>
      {side(game.a, game.seedA, m?.winsA, tbd[0])}
      {side(game.b, game.seedB, m?.winsB, tbd[1])}
    </button>
  );
}

