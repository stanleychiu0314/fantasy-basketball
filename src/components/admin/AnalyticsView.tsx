import Link from "next/link";
import type { Duo } from "@/types/league";
import { CATS, formatValue } from "@/lib/scoring";
import { GAMES_PER_WEEK, PRIOR_GAMES, type Report } from "@/lib/analytics";
import { RefreshProjections } from "./RefreshProjections";

type Props = {
  duos: Duo[];
  duoId: string;
  report: Report | null;
  sources: string[];
  updatedAt: string | null;
  playerCount: number;
  gamesPlayed: number;
};

const PERCENT = 100;
const pct = (x: number) => `${Math.round(x * PERCENT)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;

/** Admin-only analytics: category strengths, matchup odds, trade ideas and the roster, for one duo. */
export function AnalyticsView({ duos, duoId, report, sources, updatedAt, playerCount, gamesPlayed }: Props) {
  return (
    <div className="wrap adm">
      <header className="top" style={{ paddingBlock: 0 }}>
        <div>
          <p className="eyebrow">Commissioner only</p>
          <h1>Duo <span>analytics</span></h1>
        </div>
        <div className="pills">
          <Link className="btn" href="/admin">Back to admin</Link>
        </div>
      </header>

      <nav className="row2" aria-label="Duo">
        {duos.map((d) => (
          <Link key={d.id} className={`tab${d.id === duoId ? " on" : ""}`} aria-current={d.id === duoId ? "page" : undefined} href={`/admin/analytics?duo=${d.id}`}>
            {d.name}
          </Link>
        ))}
      </nav>

      <section className="card" style={{ display: "grid", gap: 8 }}>
        <p className="eyebrow">Projection data</p>
        <p className="note">
          {playerCount
            ? `${playerCount} players from ${sources.join(", ") || "no projection source"}. Projections are blended with actual stats: a player's real games count more as he plays them (equal weight at ${PRIOR_GAMES} games). Most games played so far: ${gamesPlayed}.`
            : "No projections stored yet. Pull them from ESPN to start."}
          {updatedAt ? ` Last refreshed ${new Date(updatedAt).toLocaleString()}.` : ""}
        </p>
        <RefreshProjections />
      </section>

      {!report ? (
        <p className="note">Analytics appear once projections are stored and ESPN rosters have synced.</p>
      ) : (
        <>
          <section className="card">
            <p className="eyebrow">{report.duo.name} · projected week</p>
            <p style={{ marginTop: 6 }}>
              <span className="big">{report.expectedCats.toFixed(1)}</span>
              <span className="note"> of 9 categories won in an average week, against an average opponent.</span>
            </p>
          </section>

          <section className="card">
            <p className="eyebrow">Strengths and weaknesses</p>
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th>Category</th><th style={{ textAlign: "right" }}>Projected week</th><th>Rank of {duos.length}</th><th>Win chance</th><th /></tr>
                </thead>
                <tbody>
                  {report.categories.map((c) => (
                    <tr key={c.cat.key}>
                      <td><b>{c.cat.label}</b></td>
                      <td style={{ textAlign: "right" }} className="num">{formatValue(c.cat, c.weekly)}</td>
                      <td className="num">{c.rank}</td>
                      <td>
                        <span className="meter"><i style={{ width: pct(c.winChance) }} /></span> <span className="num">{pct(c.winChance)}</span>
                      </td>
                      <td>{c.verdict !== "even" && <span className={`tag verdict ${c.verdict}`}>{c.verdict === "strength" ? "Strength" : "Weakness"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              Win chance is the average chance of winning that category against each of the other duos in one week.
            </p>
          </section>

          <section className="card">
            <p className="eyebrow">Matchup outlook</p>
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Opponent</th><th style={{ textAlign: "right" }}>Expected categories</th><th>Chance to win the week</th></tr></thead>
                <tbody>
                  {report.outlook.map((o) => (
                    <tr key={o.duo.id}>
                      <td><b>{o.duo.name}</b></td>
                      <td style={{ textAlign: "right" }} className="num">{o.expectedCats.toFixed(1)} - {(CATS.length - o.expectedCats).toFixed(1)}</td>
                      <td><span className="meter"><i style={{ width: pct(o.winChance) }} /></span> <span className="num">{pct(o.winChance)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <p className="eyebrow">Trade ideas</p>
            <p className="note" style={{ marginTop: 6 }}>
              One-for-one swaps with managers on other duos that raise your expected categories per week, where the other duo
              gains too or barely loses, so they might say yes. Trades between duo partners are never suggested.
            </p>
            {report.trades.length === 0 ? (
              <p className="note" style={{ marginTop: 8 }}>No trade clearly helps right now.</p>
            ) : (
              <div className="scroll" style={{ marginTop: 8 }}>
                <table>
                  <thead><tr><th>You give</th><th>You get</th><th style={{ textAlign: "right" }}>You</th><th style={{ textAlign: "right" }}>Them</th><th>Biggest category shifts</th></tr></thead>
                  <tbody>
                    {report.trades.map((t) => (
                      <tr key={`${t.give.playerId}-${t.get.playerId}`}>
                        <td><b>{t.give.name}</b><div className="note">{t.giveFrom}</div></td>
                        <td><b>{t.get.name}</b><div className="note">{t.getFrom} · {t.partnerDuo.name}</div></td>
                        <td style={{ textAlign: "right" }} className="num up">{signed(t.myGain)}</td>
                        <td style={{ textAlign: "right" }} className={`num ${t.theirGain >= 0 ? "up" : "down"}`}>{signed(t.theirGain)}</td>
                        <td>
                          {t.catShift.map((c) => (
                            <span key={c.key} className={`tag verdict ${c.change > 0 ? "strength" : "weakness"}`} style={{ marginRight: 4 }}>
                              {c.label} {c.change > 0 ? "+" : ""}{Math.round(c.change * PERCENT)}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="note" style={{ marginTop: 8 }}>
              You and Them are the change in expected categories won per week. Shifts are the change in your weekly win chance for that category, in points.
            </p>
          </section>

          <section className="card">
            <p className="eyebrow">Roster</p>
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Player</th><th>Role</th><th style={{ textAlign: "right" }}>Value</th>
                    {CATS.map((c) => <th key={c.key} style={{ textAlign: "right" }}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[...report.roster].sort((a, b) => b.player.value - a.player.value).map(({ player, manager, starter, ir }) => (
                    <tr key={player.playerId}>
                      <td><b>{player.name}</b><div className="note">{manager}{player.actualGames ? ` · ${player.actualGames} games played` : ""}</div></td>
                      <td>{ir ? "IR" : starter ? "Starter" : "Bench"}</td>
                      <td style={{ textAlign: "right" }} className="num">{player.value.toFixed(1)}</td>
                      {CATS.map((c) => (
                        <td key={c.key} style={{ textAlign: "right" }} className={`num ${player.z[c.key] >= 1 ? "up" : player.z[c.key] <= -1 ? "down" : ""}`}>
                          {c.pct
                            ? formatValue(c, player.perGame[c.pct[1]] > 0 ? player.perGame[c.pct[0]] / player.perGame[c.pct[1]] : null)
                            : player.perGame[c.field!].toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              Per-game numbers. Value is the sum of 9-category z-scores against the top 156 players. Green and red mark categories a
              player is a big plus or minus in. Starters are each manager&apos;s top 10 healthy players by value; weekly totals assume {GAMES_PER_WEEK} games per player.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
