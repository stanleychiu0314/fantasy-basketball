import Link from "next/link";
import type { Duo } from "@/types/league";
import { CATS, formatValue } from "@/lib/scoring";
import { PRIOR_GAMES, type RatedPlayer, type SeasonReport, type TradeIdea, type WeekReport } from "@/lib/analytics";
import { weekRange } from "@/lib/season";
import { RefreshProjections } from "./RefreshProjections";

type RosterRow = { player: RatedPlayer; manager: string; ir: boolean; injury: string; games: number; starter: boolean };
type DataInfo = { sources: string[]; updatedAt: string | null; playerCount: number; gamesPlayed: number };
type WeekLink = { week: number; when: string; game: { opponent: Duo; label: string } | null };
type Overview = { season: SeasonReport; trades: TradeIdea[]; roster: RosterRow[]; currentWeek: number };

const PERCENT = 100;
const pct = (x: number) => `${Math.round(x * PERCENT)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
const names = (ps: RatedPlayer[]) => ps.map((p) => p.name).join(" + ");

function Meter({ value }: { value: number }) {
  return (
    <>
      <span className="meter"><i style={{ width: pct(value) }} /></span> <span className="num">{pct(value)}</span>
    </>
  );
}

function TopBar({ me, eyebrow, back }: { me: Duo; eyebrow: string; back: { href: string; label: string } }) {
  return (
    <header className="top" style={{ paddingBlock: 0 }}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{me.name} <span>analytics</span></h1>
        <p className="sub">{me.a} + {me.b}, scored as one duo.</p>
      </div>
      <div className="pills">
        <Link className="btn" href={back.href}>{back.label}</Link>
      </div>
    </header>
  );
}

/** The overview: this week's and next week's matchup buttons, then season-long analysis. */
export function AnalyticsOverview({ me, info, weeks, analysis }: { me: Duo; info: DataInfo; weeks: WeekLink[]; analysis: Overview | null }) {
  return (
    <div className="wrap adm">
      <TopBar me={me} eyebrow="Only you can see this" back={{ href: "/admin", label: "Back to admin" }} />

      <div className="strip">
        {weeks.map((w) => (
          <Link key={w.week} className="mini" href={`/admin/analytics/week/${w.week}`}>
            <span className="st" style={{ gridColumn: "1 / -1" }}>{w.when} · Week {w.week} · {weekRange(w.week)}{w.game?.label ? ` · ${w.game.label}` : ""}</span>
            <span className="opp">{w.game ? `vs ${w.game.opponent.name}` : "No game this week"}</span>
            <span className="go">Open matchup and pickups →</span>
          </Link>
        ))}
      </div>

      <section className="card" style={{ display: "grid", gap: 8 }}>
        <p className="eyebrow">Projection data</p>
        <p className="note">
          {info.playerCount
            ? `${info.playerCount} players from ${info.sources.join(", ") || "no projection source"}. Each player's projection is blended with his real games: they count equally at ${PRIOR_GAMES} games, and real stats take over after that. Most games played so far: ${info.gamesPlayed}.`
            : "No projections stored yet. Pull them from ESPN to start."}
          {info.updatedAt ? ` Last refreshed ${new Date(info.updatedAt).toLocaleString()}.` : ""}
        </p>
        <RefreshProjections />
      </section>

      {!analysis ? (
        <p className="note">Analytics appear once projections are stored and ESPN rosters have synced.</p>
      ) : (
        <>
          <SeasonSection season={analysis.season} me={me} />
          <TradeSection trades={analysis.trades} />
          <RosterSection roster={analysis.roster} week={analysis.currentWeek} />
        </>
      )}
    </div>
  );
}

/** One week's matchup screen: the projection against that week's opponent, then pickups. */
export function WeekMatchup(props: { me: Duo; week: number; when: string; label: string; report: WeekReport | null; started: boolean }) {
  return (
    <div className="wrap adm">
      <TopBar me={props.me} eyebrow={props.when} back={{ href: "/admin/analytics", label: "Back to overview" }} />
      <WeekSection {...props} />
    </div>
  );
}

function WeekSection({ week, label, report: w, started }: { week: number; label: string; report: WeekReport | null; started: boolean }) {
  const title = `${label ? `${label} · ` : ""}Week ${week} · ${weekRange(week)}`;
  if (!w) {
    return (
      <section className="card">
        <p className="eyebrow">{title}</p>
        <p className="note" style={{ marginTop: 6 }}>No matchup to show: either you have no game this week, or projections have not been loaded yet.</p>
      </section>
    );
  }
  return (
    <>
      <section className="card">
        <p className="eyebrow">{title}</p>
        <h2 className="h2" style={{ fontSize: "1.8rem", marginTop: 4 }}>vs {w.opponent.name}</h2>
        <p style={{ marginTop: 6 }}>
          <span className="big">{pct(w.winChance)}</span>
          <span className="note"> to win the week · {w.expectedCats.toFixed(1)} - {(CATS.length - w.expectedCats).toFixed(1)} expected categories · games {started ? "left" : "this week"}: you {Math.round(w.myGames)}, them {Math.round(w.theirGames)}</span>
        </p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Category</th><th style={{ textAlign: "right" }}>You</th><th style={{ textAlign: "right" }}>Them</th><th>Your chance</th></tr></thead>
            <tbody>
              {w.cats.map((c) => (
                <tr key={c.cat.key}>
                  <td><b>{c.cat.label}</b></td>
                  <td style={{ textAlign: "right" }} className="num">{formatValue(c.cat, c.mine)}</td>
                  <td style={{ textAlign: "right" }} className="num">{formatValue(c.cat, c.theirs)}</td>
                  <td><Meter value={c.winChance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          {started ? "Stats already played this week plus a projection for the games left. " : "Projected from each player's games this week. "}
          Players listed OUT count for zero games; each manager fills 10 lineup spots a day, best players first.
        </p>
      </section>

      <section className="card">
        <p className="eyebrow">Pickups for this week</p>
        {w.pickups.length === 0 ? (
          <p className="note" style={{ marginTop: 6 }}>No free agent beats anyone on your rosters this week.</p>
        ) : (
          <div className="scroll" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Add</th><th>Drop</th><th style={{ textAlign: "right" }}>This week</th><th style={{ textAlign: "right" }}>Rest of season</th></tr></thead>
              <tbody>
                {w.pickups.map((p) => (
                  <tr key={p.add.playerId}>
                    <td><b>{p.add.name}</b><div className="note">{p.addGames} games</div></td>
                    <td>{p.drop.name}<div className="note">{p.dropFrom}</div></td>
                    <td style={{ textAlign: "right" }} className="num up">{signed(p.weekGain)}</td>
                    <td style={{ textAlign: "right" }} className={`num ${p.seasonGain >= 0 ? "up" : "down"}`}>{signed(p.seasonGain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note" style={{ marginTop: 8 }}>
          Change in expected categories won. A pickup that helps this week but hurts the rest of the season is a short-term stream.
        </p>
      </section>

      {w.targets.length > 0 && (
        <section className="card">
          <p className="eyebrow">Categories you are losing this week</p>
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {w.targets.map((t) => (
              <div key={t.cat.key}>
                <b>{t.cat.label}</b> <span className="note">({pct(t.winChance)} chance)</span>
                <div className="paid-list" style={{ marginTop: 4 }}>
                  {t.players.map((p) => (
                    <span key={p.player.playerId} className="tag">{p.player.name} · {p.games}g</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="note" style={{ marginTop: 8 }}>Best free agents for each category this week, counting how many games they play.</p>
        </section>
      )}
    </>
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

function TradeSection({ trades }: { trades: TradeIdea[] }) {
  return (
    <section className="card">
      <p className="eyebrow">Trade ideas</p>
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

function RosterSection({ roster, week }: { roster: RosterRow[]; week: number }) {
  return (
    <section className="card">
      <p className="eyebrow">Your roster</p>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Player</th><th>Role</th><th style={{ textAlign: "right" }}>Wk {week} games</th><th style={{ textAlign: "right" }}>Value</th>
              {CATS.map((c) => <th key={c.key} style={{ textAlign: "right" }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...roster].sort((a, b) => b.player.value - a.player.value).map((r) => (
              <tr key={r.player.playerId}>
                <td>
                  <b>{r.player.name}</b>
                  <div className="note">{r.manager}{r.injury !== "ACTIVE" ? ` · ${r.injury.replace("_", " ").toLowerCase()}` : ""}</div>
                </td>
                <td>{r.ir ? "IR" : r.starter ? "Starter" : "Bench"}</td>
                <td style={{ textAlign: "right" }} className="num">{r.games}</td>
                <td style={{ textAlign: "right" }} className="num">{r.player.value.toFixed(1)}</td>
                {CATS.map((c) => (
                  <td key={c.key} style={{ textAlign: "right" }} className={`num ${r.player.z[c.key] >= 1 ? "up" : r.player.z[c.key] <= -1 ? "down" : ""}`}>
                    {c.pct
                      ? formatValue(c, r.player.perGame[c.pct[1]] > 0 ? r.player.perGame[c.pct[0]] / r.player.perGame[c.pct[1]] : null)
                      : r.player.perGame[c.field!].toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Per-game numbers. Value is the sum of 9-category z-scores against the top 156 players. Green and red mark a big plus or minus.
      </p>
    </section>
  );
}
