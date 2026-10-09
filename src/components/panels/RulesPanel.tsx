import { CATS } from "@/lib/scoring";

const STEPS = [
  ["1", "Pair up", "12 managers form 6 duos. Each manager keeps their own 13-man ESPN roster, plus up to 3 injured reserve spots. A duo's week is both rosters added together."],
  ["2", "Weekly matchup", "Each week the 6 duos are drawn into 3 head-to-head matchups, duo against duo."],
  ["3", "Win categories", "Compare the combined totals in all 9 categories. Every category is a point, so a matchup ends like 5-3-1."],
  ["4", "Climb the table", "A matchup win goes in the W column. Standings rank by matchup record, then total category wins."],
];

export function RulesPanel() {
  return (
    <>
      <div>
        <h2 className="h2">How the season works</h2>
        <p className="lede">Six duos, nine categories, one pot. Two managers team up and their rosters count as one.</p>
      </div>
      <div className="steps">
        {STEPS.map(([n, title, text]) => (
          <div key={n} className="card step">
            <span className="n">{n}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <p className="eyebrow">The nine categories</p>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Category</th><th>Counts</th><th>Better is</th></tr>
            </thead>
            <tbody>
              {CATS.map((c) => (
                <tr key={c.key}>
                  <td><span className="cat-l">{c.label}</span><div className="note">{c.name}</div></td>
                  <td>{c.how}</td>
                  <td><span className={`tag${c.low ? " hi" : ""}`}>{c.low ? "Lower" : "Higher"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="two">
        <div className="card">
          <p className="eyebrow">Why percentages are not averaged</p>
          <p className="note" style={{ marginTop: 6 }}>
            FG% and FT% use made and attempted shots from both rosters. Averaging two percentages gives the wrong answer
            when one manager takes far more shots.
          </p>
          <div className="calc">
            <div><span>Manager A: 50 of 100</span><span>50.0%</span></div>
            <div><span>Manager B: 120 of 300</span><span>40.0%</span></div>
            <div className="bad"><span>Average of the two (wrong)</span><span>45.0%</span></div>
            <div className="good"><span>Duo total: 170 of 400</span><span>42.5%</span></div>
          </div>
        </div>
        <div className="card">
          <p className="eyebrow">Ties and tiebreakers</p>
          <ul className="clean">
            <li><b>Category tie:</b> counts as a tie for both duos, worth half a point in the category record.</li>
            <li><b>Matchup tie:</b> a 4-4-1 result is a tie and splits the matchup point.</li>
            <li><b>Standings tiebreak:</b> matchup record first, then total category wins.</li>
            <li><b>Still level:</b> the commissioner flips a coin.</li>
          </ul>
        </div>
      </div>
      <div className="card">
        <p className="eyebrow">Trades</p>
        <ul className="clean">
          <li><b>No trades between teammates.</b> Two managers in the same duo may never trade with each other, since their rosters already count as one.</li>
          <li>Trades with managers in other duos are allowed.</li>
          <li>A trade between teammates is voided and can be reversed by the commissioner.</li>
        </ul>
      </div>
    </>
  );
}
