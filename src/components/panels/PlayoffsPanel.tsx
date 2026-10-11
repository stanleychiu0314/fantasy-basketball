import type { LeagueState } from "@/types/league";
import { matchup } from "@/lib/scoring";
import { PLAYOFF_SPOTS, type Bracket, type Game } from "@/lib/playoffs";
import { weekRange } from "@/lib/season";

type Props = { state: LeagueState; bracket: Bracket; onWeek: (w: number) => void };

/** The playoff bracket: semifinals and the last place game, then the final and the 3rd place game. */
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

      {/* Desktop: a two-round bracket drawn on a grid, with SVG connector lines.
          Phones: the same cards stacked in reading order, lines hidden. */}
      <div className="bk">
        <div className="bk-head bk-c1 bk-r1">
          <h3>Semifinals</h3>
          <span>Week {bracket.semisWeek} · {weekRange(bracket.semisWeek)}</span>
        </div>
        <div className="bk-cell bk-c1 bk-r2">
          <BracketGame state={state} week={bracket.semisWeek} game={bracket.semis[0]} onWeek={onWeek} tbd={["1st seed", "1st seed's pick"]} />
        </div>
        <div className="bk-cell bk-c1 bk-r3">
          <BracketGame state={state} week={bracket.semisWeek} game={bracket.semis[1]} onWeek={onWeek} tbd={["Seed", "Seed"]} />
        </div>

        <svg className="bk-lines bk-c2 bk-r2-4" aria-hidden="true">
          {/* Winners: both semis join and run into the Final. The join sits at 35% so the
              runs into the finals column are long enough to carry their labels. */}
          <line className="win" x1="0" y1="16.667%" x2="35%" y2="16.667%" />
          <line className="win" x1="0" y1="50%" x2="35%" y2="50%" />
          <line className="win" x1="35%" y1="16.667%" x2="35%" y2="50%" />
          <line className="win" x1="35%" y1="33.333%" x2="100%" y2="33.333%" />
          {/* Losers: drop from the bracket to the 3rd place game. */}
          <line className="lose" x1="35%" y1="50%" x2="35%" y2="83.333%" />
          <line className="lose" x1="35%" y1="83.333%" x2="100%" y2="83.333%" />
          <text x="68%" y="33.333%" dy="-7" textAnchor="middle">winners</text>
          <text x="68%" y="83.333%" dy="-7" textAnchor="middle">losers</text>
        </svg>

        <div className="bk-head bk-c3 bk-r1">
          <h3>Finals</h3>
          <span>Week {bracket.finalsWeek} · {weekRange(bracket.finalsWeek)}</span>
        </div>
        <div className="bk-cell bk-c3 bk-r2-3 bk-mid">
          <BracketGame state={state} week={bracket.finalsWeek} game={bracket.final} onWeek={onWeek} tbd={["Semifinal winner", "Semifinal winner"]} stakes="for 1st place" />
        </div>
        <div className="bk-cell bk-c3 bk-r4">
          <BracketGame state={state} week={bracket.finalsWeek} game={bracket.thirdPlace} onWeek={onWeek} tbd={["Semifinal loser", "Semifinal loser"]} stakes="for 3rd place" />
        </div>

        <div className="bk-sep bk-r5">Last place · Week {bracket.semisWeek}</div>
        <div className="bk-cell bk-c1 bk-r6">
          <BracketGame state={state} week={bracket.semisWeek} game={bracket.lastPlace} onWeek={onWeek} tbd={["5th seed", "6th seed"]} stakes="for 5th place" />
        </div>
        <svg className="bk-lines bk-c2 bk-r6" aria-hidden="true">
          <line className="lose" x1="0" y1="50%" x2="100%" y2="50%" />
        </svg>
        <div className="bk-cell bk-c3 bk-r6 bk-mid">
          <div className="bgame bk-outcome">
            <p className="lbl">Result</p>
            <div className={`bside${bracket.lastPlace.winner ? " won" : ""}`}>
              <span className="seed">5</span>
              <span className={`nm${bracket.lastPlace.winner ? "" : " tbd"}`}>{bracket.lastPlace.winner?.name ?? "Winner finishes 5th"}</span>
            </div>
            <div className={`bside${bracket.lastPlace.loser ? " lost" : ""}`}>
              <span className="seed">6</span>
              <span className={`nm${bracket.lastPlace.loser ? "" : " tbd"}`}>{bracket.lastPlace.loser?.name ?? "Loser finishes last"}</span>
            </div>
          </div>
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

type GameProps = {
  state: LeagueState;
  week: number;
  game: Game;
  /** Placeholder names while a side is undecided. */
  tbd: [string, string];
  /** What the game decides, e.g. "for 1st place". */
  stakes?: string;
  onWeek: (w: number) => void;
};

/** One bracket game: two seeded sides and their category wins. Opens that week's full matchup. */
function BracketGame({ state, week, game, tbd, stakes, onWeek }: GameProps) {
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
    <button className="bgame" onClick={() => onWeek(week)}>
      <p className="lbl">
        {game.label}
        {stakes ? <span className="stakes"> {stakes}</span> : null}
        {m?.played && !game.winner ? " · live" : ""}
      </p>
      {side(game.a, game.seedA, m?.winsA, tbd[0])}
      {side(game.b, game.seedB, m?.winsB, tbd[1])}
    </button>
  );
}

