import Link from "next/link";
import type { Duo, StatLine } from "@/types/league";
import type { WeekReport } from "@/lib/analytics";
import { CATS, catValue, formatValue, type Category } from "@/lib/scoring";
import { weekRange } from "@/lib/season";
import type { WeekMoves } from "@/lib/snapshot-rules";
import type { Snapshot } from "@/lib/snapshots";
import { formatDiff, leadOf, type Lead, type ManagerGames, type RosterRow } from "@/lib/week-view";
import { RecomputeButton } from "./RecomputeButton";
import { WeekTabs } from "./WeekTabs";

export type DuoGames = { duo: Duo; managers: ManagerGames[] };
export type RosterBox = { manager: string; duo: string; rows: RosterRow[] };

/** Everything the week screen shows once projections and rosters are loaded. */
export type WeekData = {
  report: WeekReport;
  /** Stats already played this week, per duo. */
  now: { mine: StatLine; theirs: StatLine };
  /** My duo first, then the opponent. */
  games: [DuoGames, DuoGames];
  moves: Snapshot<WeekMoves> | null;
  boxes: RosterBox[];
  /** Stanley vs Adam this week. Lines are null until ESPN has stats for the week. */
  teammates: { me: ManagerGames; mate: ManagerGames; mine: StatLine | null; theirs: StatLine | null };
};

type Props = { me: Duo; week: number; when: string; label: string; started: boolean; data: WeekData | null };

const PERCENT = 100;
const pct = (x: number) => `${Math.round(x * PERCENT)}%`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
const RIGHT = { textAlign: "right" } as const;
/** Box score order for a player's week, the way stat lines usually read. */
const LINE_CATS = ["pts", "reb", "ast", "stl", "blk", "tpm", "to", "fg", "ft"].map((k) => CATS.find((c) => c.key === k)!);
const leadClass = (lead: Lead) => (lead === 1 ? "up" : lead === -1 ? "down" : "");
const value = (line: StatLine | null, cat: Category) => (line ? catValue(line, cat) : null);

/** When a saved snapshot was computed, so stale suggestions are obvious. */
function AsOf({ asOf }: { asOf: Date | null }) {
  return <p className="note" style={{ marginTop: 6 }}>{asOf ? `As of ${asOf.toLocaleString()}` : "Not computed yet"}</p>;
}

function Meter({ value }: { value: number }) {
  return (
    <>
      <span className="meter"><i style={{ width: pct(value) }} /></span> <span className="num">{pct(value)}</span>
    </>
  );
}

/** One week's screen: matchup, moves, rosters and the teammate head-to-head, as tabs. */
export function WeekView({ me, week, when, label, started, data }: Props) {
  const title = `${label ? `${label} · ` : ""}Week ${week} · ${weekRange(week)}`;
  return (
    <div className="wrap adm">
      <header className="top" style={{ paddingBlock: 0 }}>
        <div>
          <p className="eyebrow">{when} · {title}</p>
          <h1>{me.name} <span>{data ? `vs ${data.report.opponent.name}` : "analytics"}</span></h1>
          <p className="sub">{me.a} + {me.b}, scored as one duo.</p>
        </div>
        <div className="pills">
          <Link className="btn" href="/admin">Back to overview</Link>
        </div>
      </header>
      {!data ? (
        <section className="card">
          <p className="note">No matchup to show: either you have no game this week, or projections have not been loaded yet.</p>
        </section>
      ) : (
        <WeekTabs
          tabs={[
            { id: "matchup", label: "Matchup", panel: <MatchupTab data={data} started={started} /> },
            { id: "moves", label: "Moves", panel: <MovesTab week={week} moves={data.moves} /> },
            { id: "rosters", label: "Rosters", panel: <RostersTab boxes={data.boxes} /> },
            { id: "teammate", label: `You vs ${data.teammates.mate.name}`, panel: <TeammateTab t={data.teammates} /> },
          ]}
        />
      )}
    </div>
  );
}

function GamesTable({ games }: { games: WeekData["games"] }) {
  const left = games.map((g) => g.managers.reduce((n, m) => n + m.left, 0));
  const ahead = left[0] === left[1] ? -1 : left[0] > left[1] ? 0 : 1;
  return (
    <div className="scroll" style={{ marginTop: 8 }}>
      <table>
        <thead><tr><th>Manager</th><th style={RIGHT}>Played</th><th style={RIGHT}>Left</th></tr></thead>
        <tbody>
          {games.map((g, i) => (
            <GamesRows key={g.duo.id} g={g} left={left[i]} more={ahead === i} mine={i === 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GamesRows({ g, left, more, mine }: { g: DuoGames; left: number; more: boolean; mine: boolean }) {
  return (
    <>
      {g.managers.map((m) => (
        <tr key={m.key}>
          <td>{m.name}</td>
          <td style={RIGHT} className="num">{m.played}</td>
          <td style={RIGHT} className="num">{Math.round(m.left)}</td>
        </tr>
      ))}
      <tr className={mine ? "mine" : ""}>
        <td><b>{g.duo.name}</b></td>
        <td style={RIGHT} className="num"><b>{g.managers.reduce((n, m) => n + m.played, 0)}</b></td>
        <td style={RIGHT} className={`num${more ? " lead" : ""}`}><b>{Math.round(left)}</b>{more && <span className="tag" style={{ marginLeft: 6 }}>More left</span>}</td>
      </tr>
    </>
  );
}

function MatchupTab({ data, started }: { data: WeekData; started: boolean }) {
  const { report: w, now, games } = data;
  return (
    <>
      <section className="card">
        <p className="eyebrow">Games this week</p>
        <GamesTable games={games} />
        <p className="note" style={{ marginTop: 8 }}>
          Played counts active lineup games so far. Left is projected for the days after today: each manager fills 10 lineup spots a day,
          and players listed OUT or on IR count for zero.
        </p>
      </section>

      <section className="card">
        <p className="eyebrow">Categories</p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th>Category</th><th style={RIGHT}>You</th><th style={RIGHT}>Them</th><th style={RIGHT}>±</th><th style={RIGHT}>Projected ±</th></tr>
            </thead>
            <tbody>
              {w.cats.map((c) => {
                const mine = catValue(now.mine, c.cat);
                const theirs = catValue(now.theirs, c.cat);
                return (
                  <tr key={c.cat.key}>
                    <td><b>{c.cat.label}</b></td>
                    <td style={RIGHT} className="num">{formatValue(c.cat, mine)}</td>
                    <td style={RIGHT} className="num">{formatValue(c.cat, theirs)}</td>
                    <td style={RIGHT} className={`num ${leadClass(leadOf(c.cat, mine, theirs))}`}>{formatDiff(c.cat, mine, theirs)}</td>
                    <td style={RIGHT} className={`num ${leadClass(leadOf(c.cat, c.mine, c.theirs))}`}>{formatDiff(c.cat, c.mine, c.theirs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          You, Them and ± are the stats already played{started ? "" : " (none yet, the week has not started)"}. Projected ± adds a
          projection for the games left. Green means you are ahead, red behind; fewer turnovers is better.
        </p>
      </section>

      <section className="card">
        <p className="eyebrow">Projection · chance to win</p>
        <p style={{ marginTop: 6 }}>
          <span className="big">{pct(w.winChance)}</span>
          <span className="note"> to win the week · {w.expectedCats.toFixed(1)} - {(CATS.length - w.expectedCats).toFixed(1)} expected categories</span>
        </p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Category</th><th style={RIGHT}>You</th><th style={RIGHT}>Them</th><th>Your chance</th></tr></thead>
            <tbody>
              {w.cats.map((c) => (
                <tr key={c.cat.key}>
                  <td><b>{c.cat.label}</b></td>
                  <td style={RIGHT} className="num">{formatValue(c.cat, c.mine)}</td>
                  <td style={RIGHT} className="num">{formatValue(c.cat, c.theirs)}</td>
                  <td><Meter value={c.winChance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Projected final totals: {started ? "stats already played plus a projection for the games left" : "projected from each player's games this week"}.
        </p>
      </section>
    </>
  );
}

function MovesTab({ week, moves }: { week: number; moves: Snapshot<WeekMoves> | null }) {
  const m = moves?.data;
  return (
    <>
      <section className="card">
        <p className="eyebrow">Pickups for this week</p>
        <AsOf asOf={moves?.computedAt ?? null} />
        <RecomputeButton week={week} />
        {!m || m.pickups.length === 0 ? (
          <p className="note" style={{ marginTop: 6 }}>{m ? "No free agent beats anyone on your rosters this week." : "Moves are not computed yet."}</p>
        ) : (
          <div className="scroll" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Add</th><th>Drop</th><th style={RIGHT}>This week</th><th style={RIGHT}>Rest of season</th></tr></thead>
              <tbody>
                {m.pickups.map((p) => (
                  <tr key={`${p.dropFrom}-${p.add.playerId}`}>
                    <td>
                      <b>{p.add.name}</b>
                      {p.stream && <span className="tag verdict weakness" style={{ marginLeft: 6 }}>1-week stream</span>}
                      <div className="note">{p.addGames} games · for {p.dropFrom}</div>
                    </td>
                    <td>{p.drop ? p.drop.name : <span className="note">Nobody · open roster spot</span>}</td>
                    <td style={RIGHT} className={`num ${p.weekGain >= 0 ? "up" : "down"}`}>{signed(p.weekGain)}</td>
                    <td style={RIGHT} className={`num ${p.seasonGain >= 0 ? "up" : "down"}`}>{signed(p.seasonGain)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note" style={{ marginTop: 8 }}>
          Change in expected categories won. Ranked by this week plus the rest of the season. A &ldquo;1-week stream&rdquo; helps now but
          costs you later, so drop him again after the week. With an open roster spot (someone moved to IR) there is nothing to drop.
        </p>
      </section>

      {m && (
        <section className="card">
          <p className="eyebrow">Categories you are losing this week</p>
          {m.targets.length === 0 ? (
            <p className="note" style={{ marginTop: 6 }}>You are projected to win or tie every category.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {m.targets.map((t) => (
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
          )}
          <p className="note" style={{ marginTop: 8 }}>Best free agents for each category this week, counting how many games they play.</p>
        </section>
      )}

      {m && <StreamingCard streaming={m.streaming} />}
    </>
  );
}

function StreamingCard({ streaming }: { streaming: WeekMoves["streaming"] }) {
  return (
    <section className="card">
      <p className="eyebrow">Streaming</p>
      {!streaming ? (
        <p className="note" style={{ marginTop: 6 }}>ESPN&apos;s defense data was unavailable when these moves were computed, so streaming was skipped. Recompute to try again.</p>
      ) : (
        <>
          <p className="note" style={{ marginTop: 6 }}>
            Favorable: the opponent is one of the 10 worst defenses by points allowed per game. Unfavorable: one of the 10 best.
          </p>
          <h3 style={{ marginTop: 12 }}>NBA teams with 4+ games</h3>
          {streaming.teams.length === 0 ? (
            <p className="note" style={{ marginTop: 6 }}>No team plays 4 games this week.</p>
          ) : (
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Team</th><th style={RIGHT}>Games</th><th style={RIGHT}>Favorable</th><th style={RIGHT}>Unfavorable</th></tr></thead>
                <tbody>
                  {streaming.teams.map((t) => (
                    <tr key={t.proTeamId}>
                      <td><b>{t.abbrev}</b></td>
                      <td style={RIGHT} className="num">{t.games}</td>
                      <td style={RIGHT} className="num up">{t.favorable}</td>
                      <td style={RIGHT} className="num down">{t.unfavorable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 style={{ marginTop: 12 }}>Free agents to stream</h3>
          {streaming.candidates.length === 0 ? (
            <p className="note" style={{ marginTop: 6 }}>No free agent with games this week.</p>
          ) : (
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Player</th><th>Team</th><th style={RIGHT}>Games</th><th style={RIGHT}>Favorable</th><th style={RIGHT}>Unfavorable</th></tr></thead>
                <tbody>
                  {streaming.candidates.map((c) => (
                    <tr key={c.playerId}>
                      <td><b>{c.name}</b></td>
                      <td>{c.abbrev}</td>
                      <td style={RIGHT} className="num">{c.games}</td>
                      <td style={RIGHT} className="num up">{c.favorable}</td>
                      <td style={RIGHT} className="num down">{c.unfavorable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="note" style={{ marginTop: 8 }}>Ranked by games this week, then by favorable minus unfavorable games, then by player value.</p>
        </>
      )}
    </section>
  );
}

function RostersTab({ boxes }: { boxes: RosterBox[] }) {
  return (
    <>
      <div className="box">
        {boxes.map((b) => (
          <section key={b.manager} className="card">
            <p className="eyebrow">{b.duo}</p>
            <h3>{b.manager}</h3>
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th>Player</th><th className="num">G</th><th className="num">Left</th><th>Today</th>
                    {LINE_CATS.map((c) => <th key={c.key} className="num">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.playerId}>
                      <td className="pn">
                        {r.name}
                        {r.tag && <span className={`tag${r.tag === "Dropped" ? "" : " verdict weakness"}`} style={{ marginLeft: 6 }}>{r.tag}</span>}
                      </td>
                      <td className="num">{r.played}</td>
                      <td className="num">{r.left}</td>
                      <td>{r.today === null ? "–" : r.today ? "Yes" : "No"}</td>
                      {LINE_CATS.map((c) => <td key={c.key} className="num">{r.line ? formatValue(c, catValue(r.line, c)) : "–"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="note">
        G is games played this week in the active lineup; the line is this week&apos;s totals from those games. Left counts NBA games
        after today (OUT and IR count for zero). Dropped players are listed because their games this week still count.
      </p>
    </>
  );
}

function TeammateTab({ t }: { t: WeekData["teammates"] }) {
  const leads = CATS.map((c) => leadOf(c, value(t.mine, c), value(t.theirs, c)));
  const count = (l: Lead) => leads.filter((x) => x === l).length;
  return (
    <section className="card">
      <p className="eyebrow">{t.me.name} vs {t.mate.name} · this week</p>
      <p style={{ marginTop: 6 }}>
        <span className="big">{count(1)} - {count(-1)}</span>
        <span className="note"> categories{count(0) ? ` · ${count(0)} tied` : ""} · games played: {t.me.name} {t.me.played}, {t.mate.name} {t.mate.played}</span>
      </p>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead><tr><th>Category</th><th style={RIGHT}>{t.me.name}</th><th style={RIGHT}>{t.mate.name}</th><th>Leads</th></tr></thead>
          <tbody>
            {CATS.map((c, i) => (
              <tr key={c.key}>
                <td><b>{c.label}</b></td>
                <td style={RIGHT} className={`num ${leadClass(leads[i])}`}>{formatValue(c, value(t.mine, c))}</td>
                <td style={RIGHT} className="num">{formatValue(c, value(t.theirs, c))}</td>
                <td>{leads[i] === 1 ? t.me.name : leads[i] === -1 ? t.mate.name : leads[i] === 0 ? "Tied" : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8 }}>Information only. Teammates are scored as one duo, so this never affects results.</p>
    </section>
  );
}
