import Link from "next/link";
import type { Duo } from "@/types/league";
import { CATS, formatValue } from "@/lib/scoring";
import { PRIOR_GAMES, type RatedPlayer, type SeasonReport, type TradeIdea } from "@/lib/analytics";
import { formatEt, weekRange } from "@/lib/season";
import type { TeammateReport, TeammateWeek } from "@/lib/teammates";
import { AsOf, Meter, signed } from "./AnalyticsBits";
import { RefreshProjections } from "./RefreshProjections";
import { RecomputeButton } from "./RecomputeButton";

type DataInfo = { sources: string[]; updatedAt: string | null; playerCount: number; gamesPlayed: number };
type WeekLink = { week: number; when: string; game: { opponent: Duo; label: string } | null };
type Overview = { season: SeasonReport; trades: TradeIdea[]; tradesAsOf: string | null };

const names = (ps: RatedPlayer[]) => ps.map((p) => p.name).join(" + ");

/** The admin home: matchup buttons, you vs your partner, season analysis, trades, then projection data. */
export function AnalyticsOverview({ me, info, weeks, teammates, analysis }: { me: Duo; info: DataInfo; weeks: WeekLink[]; teammates: TeammateReport; analysis: Overview | null }) {
  return (
    <>
      <p className="sub">{me.name}: {me.a} + {me.b}, scored as one duo.</p>

      <div className="strip">
        {weeks.map((w) => (
          <Link key={w.week} className="mini" href={`/admin/analytics/week/${w.week}`}>
            <span className="st" style={{ gridColumn: "1 / -1" }}>{w.when} · Week {w.week} · {weekRange(w.week)}{w.game?.label ? ` · ${w.game.label}` : ""}</span>
            <span className="opp">{w.game ? `vs ${w.game.opponent.name}` : "No game this week"}</span>
            <span className="go">Open matchup and pickups →</span>
          </Link>
        ))}
      </div>

      <TeammateSection me={me} report={teammates} />

      {!analysis ? (
        <p className="note">Analytics appear once projections are stored and ESPN rosters have synced.</p>
      ) : (
        <>
          <SeasonSection season={analysis.season} me={me} />
          <TradeSection trades={analysis.trades} asOf={analysis.tradesAsOf} />
        </>
      )}

      <section className="card" style={{ display: "grid", gap: 8 }}>
        <p className="eyebrow">Projection data</p>
        <p className="note">
          {info.playerCount
            ? `${info.playerCount} players from ${info.sources.join(", ") || "no projection source"}. Each player's projection is blended with his real games: they count equally at ${PRIOR_GAMES} games, and real stats take over after that. Most games played so far: ${info.gamesPlayed}.`
            : "No projections stored yet. Pull them from ESPN to start."}
          {info.updatedAt ? ` Last refreshed ${formatEt(info.updatedAt)}.` : ""}
        </p>
        <RefreshProjections />
      </section>
    </>
  );
}

/** Categories won by each partner in every week, with a subtotal per month and a season total. */
function TeammateSection({ me, report }: { me: Duo; report: TeammateReport }) {
  const right = { textAlign: "right" } as const;
  const cells = (s: { a: number; b: number; ties: number; games: { a: number; b: number } }) => (
    <>
      <td style={right} className={`num${s.a > s.b ? " lead" : ""}`}>{s.a}</td>
      <td style={right} className={`num${s.b > s.a ? " lead" : ""}`}>{s.b}</td>
      <td style={right} className="num">{s.ties}</td>
      <td style={right} className="num">{s.games.a}</td>
      <td style={right} className="num">{s.games.b}</td>
    </>
  );
  return (
    <section className="card">
      <p className="eyebrow">You vs {me.a}</p>
      {report.months.length === 0 ? (
        <p className="note" style={{ marginTop: 6 }}>No week has both managers&apos; scores yet.</p>
      ) : (
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Week</th><th style={right}>{me.a}</th><th style={right}>{me.b}</th><th style={right}>Ties</th><th style={right}>{me.a} games</th><th style={right}>{me.b} games</th></tr></thead>
            <tbody>
              {report.months.flatMap((m) => [
                ...m.weeks.map((w) => (
                  <tr key={w.week}><td><WeekBreakdown me={me} week={w} /></td>{cells(w)}</tr>
                )),
                <tr key={m.label}><td><b>{m.label}</b></td>{cells({ ...m.total, games: m.games })}</tr>,
              ])}
              <tr className="mine"><td><b>Season</b></td>{cells({ ...report.total, games: report.games })}</tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 8 }}>
        Categories each of you won in a week, comparing your own team totals. Fewer turnovers wins TO. Ties are counted, and months follow the week&apos;s start date. Games are active lineup games played. Tap a week to see every category.
      </p>
    </section>
  );
}

/** A week label that opens to every category: each partner's value and who won it. */
function WeekBreakdown({ me, week }: { me: Duo; week: TeammateWeek }) {
  const right = { textAlign: "right" } as const;
  return (
    <details>
      <summary style={{ cursor: "pointer" }}>Week {week.week} · {weekRange(week.week)}</summary>
      <div className="eb" style={{ marginTop: 8, padding: 8 }}>
        <table>
          <thead><tr><th>Cat</th><th style={right}>{me.a}</th><th style={right}>{me.b}</th><th>Won</th></tr></thead>
          <tbody>
            {CATS.map((cat, i) => {
              const c = week.cats[i];
              return (
                <tr key={cat.key}>
                  <td>{cat.label}</td>
                  <td style={right} className={`num${c.winner === "a" ? " lead" : ""}`}>{formatValue(cat, c.a)}</td>
                  <td style={right} className={`num${c.winner === "b" ? " lead" : ""}`}>{formatValue(cat, c.b)}</td>
                  <td>{c.winner === "tie" ? "Tie" : c.winner === "a" ? me.a : me.b}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SeasonSection({ season, me }: { season: SeasonReport; me: Duo }) {
  // Leader per category column, so the table shows at a glance who owns each category.
  const best = CATS.map((cat, i) => {
    const vals = season.table.map((r) => r.values[i] ?? (cat.low ? Infinity : -Infinity));
    return cat.low ? Math.min(...vals) : Math.max(...vals);
  });
  return (
    <>
      <section className="card">
        <p className="eyebrow">Your duo vs every duo · average week</p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th>Duo</th>{CATS.map((c) => <th key={c.key} style={{ textAlign: "right" }}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {season.table.map((r) => (
                <tr key={r.duo.id} className={r.duo.id === me.id ? "mine" : ""}>
                  <td><b>{r.duo.name}</b></td>
                  {CATS.map((c, i) => (
                    <td key={c.key} style={{ textAlign: "right" }} className={`num${r.values[i] === best[i] ? " lead" : ""}`}>{formatValue(c, r.values[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>Projected totals for an average week. The leader in each category is highlighted.</p>
      </section>

      <section className="card">
        <p className="eyebrow">Season outlook · strengths and weaknesses</p>
        <p style={{ marginTop: 6 }}>
          <span className="big">{season.expectedCats.toFixed(1)}</span>
          <span className="note"> of 9 categories in an average week for {me.name}.</span>
        </p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Category</th><th style={{ textAlign: "right" }}>Average week</th><th>Rank of 6</th><th>Win chance</th><th /></tr></thead>
            <tbody>
              {season.categories.map((c) => (
                <tr key={c.cat.key}>
                  <td><b>{c.cat.label}</b></td>
                  <td style={{ textAlign: "right" }} className="num">{formatValue(c.cat, c.weekly)}</td>
                  <td className="num">{c.rank}</td>
                  <td><Meter value={c.winChance} /></td>
                  <td>{c.verdict !== "even" && <span className={`tag verdict ${c.verdict}`}>{c.verdict === "strength" ? "Strength" : "Strengthen"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Season outlook · against each duo</p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Opponent</th><th style={{ textAlign: "right" }}>Expected categories</th><th>Chance to win an average week</th></tr></thead>
            <tbody>
              {season.outlook.map((o) => (
                <tr key={o.duo.id}>
                  <td><b>{o.duo.name}</b></td>
                  <td style={{ textAlign: "right" }} className="num">{o.expectedCats.toFixed(1)} - {(CATS.length - o.expectedCats).toFixed(1)}</td>
                  <td><Meter value={o.winChance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TradeSection({ trades, asOf }: { trades: TradeIdea[]; asOf: string | null }) {
  return (
    <section className="card">
      <p className="eyebrow">Trade ideas</p>
      <AsOf asOf={asOf} />
      <RecomputeButton />
      <p className="note" style={{ marginTop: 6 }}>
        1 to 3 players a side. Each package is priced by where its players went in your league&apos;s draft, so both sides are
        worth about the same. Ideas where both duos gain about equally come first, since those get accepted. Trades with
        your partner are never suggested.
      </p>
      {trades.length === 0 ? (
        <p className="note" style={{ marginTop: 8 }}>No fair trade clearly helps right now.</p>
      ) : (
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>You give</th><th>You get</th><th style={{ textAlign: "right" }}>You</th><th style={{ textAlign: "right" }}>Them</th><th style={{ textAlign: "right" }}>Draft value</th></tr></thead>
            <tbody>
              {trades.map((t) => (
                <tr key={`${names(t.give)}>${names(t.get)}`}>
                  <td><b>{names(t.give)}</b><div className="note">{t.giveFrom}</div></td>
                  <td>
                    <b>{names(t.get)}</b>
                    <div className="note">
                      {t.getFrom} · {t.partnerDuo.name}
                      {t.rosterChange > 0 ? ` · you drop ${t.rosterChange}` : t.rosterChange < 0 ? ` · you add ${-t.rosterChange} free agent` : ""}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }} className="num up">{signed(t.myGain)}</td>
                  <td style={{ textAlign: "right" }} className={`num ${t.theirGain >= 0 ? "up" : "down"}`}>{signed(t.theirGain)}</td>
                  <td style={{ textAlign: "right" }} className="num">{t.giveValue.toFixed(0)} for {t.getValue.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 8 }}>You and Them: change in expected categories won in an average week, for the rest of the season.</p>
    </section>
  );
}
