import Link from "next/link";
import type { Duo, StatLine } from "@/types/league";
import type { WeekReport } from "@/lib/analytics";
import { CATS, catValue, formatValue, type Category } from "@/lib/scoring";
import { weekRange } from "@/lib/season";
import type { WeekMoves } from "@/lib/snapshot-rules";
import type { Snapshot } from "@/lib/snapshots";
import { formatDiff, leadOf, type LeagueRow, type Lead, type ManagerGames, type RosterRow, type ScheduleRow, type StarPill } from "@/lib/week-view";
import { AsOf, Meter, pct, signed } from "./AnalyticsBits";
import { RecomputeButton } from "./RecomputeButton";
import { SubTabs, WeekTabs } from "./WeekTabs";

export type DuoGames = { duo: Duo; managers: ManagerGames[]; stars: StarPill[] };
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
  /** Each duo's players by draft pick against the week's days. My duo first. */
  schedule: { days: { day: number; label: string }[]; sides: { duo: Duo; rows: ScheduleRow[] }[] };
  /** The top players in the league by value, rostered or not. */
  league: LeagueRow[];
  /** Stanley vs Adam this week. Lines are null until ESPN has stats for the week. */
  teammates: { me: ManagerGames; mate: ManagerGames; mine: StatLine | null; theirs: StatLine | null };
};

type Props = { me: Duo; week: number; when: string; label: string; started: boolean; data: WeekData | null };

const RIGHT = { textAlign: "right" } as const;
/** Box score order for a player's week, the way stat lines usually read. */
const LINE_CATS = ["pts", "reb", "ast", "stl", "blk", "tpm", "to", "fg", "ft"].map((k) => CATS.find((c) => c.key === k)!);
const leadClass = (lead: Lead) => (lead === 1 ? "up" : lead === -1 ? "down" : "");
const value = (line: StatLine | null, cat: Category) => (line ? catValue(line, cat) : null);

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
            { id: "rosters", label: "Rosters", panel: <RostersTab boxes={data.boxes} schedule={data.schedule} /> },
            { id: "teammate", label: `You vs ${data.teammates.mate.name}`, panel: <TeammateTab t={data.teammates} /> },
            { id: "league", label: "League", panel: <LeagueTab rows={data.league} /> },
          ]}
        />
      )}
    </div>
  );
}

/** Two columns, my duo then the opponent, each with its total, its managers and its top drafted players. They stack on phones. */
function GamesTable({ games }: { games: WeekData["games"] }) {
  const left = games.map((g) => g.managers.reduce((n, m) => n + m.left, 0));
  const ahead = left[0] === left[1] ? -1 : left[0] > left[1] ? 0 : 1;
  return (
    <div className="two" style={{ marginTop: 8 }}>
      {games.map((g, i) => (
        <GamesColumn key={g.duo.id} g={g} left={left[i]} more={ahead === i} mine={i === 0} />
      ))}
    </div>
  );
}

function GamesColumn({ g, left, more, mine }: { g: DuoGames; left: number; more: boolean; mine: boolean }) {
  return (
    <div>
      <div className="scroll">
        <table>
          <thead><tr><th>{mine ? "Your duo" : "Opponent"}</th><th style={RIGHT}>Played</th><th style={RIGHT}>Left</th></tr></thead>
          <tbody>
            <tr className={mine ? "mine" : ""}>
              <td><b>{g.duo.name}</b></td>
              <td style={RIGHT} className="num"><b>{g.managers.reduce((n, m) => n + m.played, 0)}</b></td>
              <td style={RIGHT} className={`num${more ? " lead" : ""}`}><b>{Math.round(left)}</b>{more && <span className="tag" style={{ display: "block", width: "fit-content", marginLeft: "auto", marginTop: 4, whiteSpace: "nowrap" }}>More left</span>}</td>
            </tr>
            {g.managers.map((m) => (
              <tr key={m.key}>
                <td>{m.name}</td>
                <td style={RIGHT} className="num">{m.played}</td>
                <td style={RIGHT} className="num">{Math.round(m.left)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.stars.length > 0 && (
        <div className="paid-list" aria-label={`${g.duo.name}'s top drafted players and their games this week`}>
          {g.stars.map((p) => <span key={p.playerId} className="tag">{p.name} {p.games}</span>)}
        </div>
      )}
    </div>
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
          Played counts active lineup games so far. Left is projected for the rest of the week, including today&apos;s games not
          started yet: each manager fills 10 lineup spots a day, and players listed OUT or on IR count for zero. Pills: each manager&apos;s
          top 5 players by this league&apos;s draft pick, with their games this week.
        </p>
      </section>

      <section className="card">
        <p className="eyebrow">Categories</p>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr><th>Category</th><th style={RIGHT}>You</th><th style={RIGHT}>Them</th><th style={RIGHT}>±</th><th style={{ ...RIGHT, whiteSpace: "normal" }}>Projected ±</th></tr>
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

function RostersTab({ boxes, schedule }: { boxes: RosterBox[]; schedule: WeekData["schedule"] }) {
  return (
    <SubTabs
      id="rosters"
      label="Roster views"
      tabs={[
        { id: "stats", label: "Stats", panel: <RosterStats boxes={boxes} /> },
        { id: "schedule", label: "Schedule", panel: <RosterSchedule schedule={schedule} /> },
      ]}
    />
  );
}

/** Both duos side by side (stacked on phones): "P" on each day a player's NBA team plays. */
function RosterSchedule({ schedule }: { schedule: WeekData["schedule"] }) {
  const center = { textAlign: "center" } as const;
  return (
    <>
      <div className="box">
        {schedule.sides.map(({ duo, rows }, i) => (
          <section key={duo.id} className="card">
            <p className="eyebrow">{i === 0 ? "Your duo" : "Opponent"}</p>
            <h3>{duo.name}</h3>
            <div className="scroll" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr><th>Player</th>{schedule.days.map((d) => <th key={d.day} style={center}>{d.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.playerId}>
                      <td className="pn">
                        {r.name}
                        {r.tag && <span className="tag verdict weakness" style={{ marginLeft: 6 }}>{r.tag}</span>}
                        <small>{r.manager}</small>
                      </td>
                      {r.plays.map((p, j) => <td key={schedule.days[j].day} style={center}>{p ? <b>P</b> : "-"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="note">Players are in this league&apos;s draft order. P means his NBA team plays that day, even if he is on IR or OUT.</p>
    </>
  );
}

/** Per-game counting stats read better with one decimal; percentages keep their own format. */
const perGame = (line: StatLine, cat: Category) => (cat.pct ? formatValue(cat, catValue(line, cat)) : (catValue(line, cat) ?? 0).toFixed(1));
const LEAGUE_CATS = ["pts", "tpm", "reb", "ast", "stl", "blk", "to", "fg", "ft"].map((k) => CATS.find((c) => c.key === k)!);

function LeagueTab({ rows }: { rows: LeagueRow[] }) {
  return (
    <section className="card">
      <p className="eyebrow">League · top {rows.length} by value</p>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th style={RIGHT}>#</th><th>Player</th><th>Owner</th><th style={RIGHT}>Games</th>
              {LEAGUE_CATS.map((c) => <th key={c.key} style={RIGHT}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId} className={r.side === "mine" ? "mine" : ""}>
                <td style={RIGHT} className="num">{i + 1}</td>
                <td><b>{r.name}</b></td>
                <td>
                  {r.side
                    ? <span className={`tag ${r.side === "mine" ? "hi" : "verdict weakness"}`}>{r.owner}</span>
                    : <span className={r.owner ? "" : "note"}>{r.owner ?? "Free agent"}</span>}
                </td>
                <td style={RIGHT} className="num">{r.games}</td>
                {LEAGUE_CATS.map((c) => <td key={c.key} style={RIGHT} className="num">{perGame(r.perGame, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Every player with a projection, rostered or free agent, ranked by 9-cat value. Stats are per game (projection blended with
        real games). Games are his NBA games this week; OUT counts for zero. Your duo&apos;s players are highlighted, the opponent&apos;s are in red.
      </p>
    </section>
  );
}

function RosterStats({ boxes }: { boxes: RosterBox[] }) {
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
        still to play, today&apos;s included until they start (OUT and IR count for zero). Dropped players are listed because their games this week still count.
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
        <span className="note">
          {" "}categories{count(0) ? ` · ${count(0)} tied` : ""} · games played: {t.me.name} {t.me.played}, {t.mate.name} {t.mate.played}
          {" "}· projected games left: {t.me.name} {Math.round(t.me.left)}, {t.mate.name} {Math.round(t.mate.left)}
        </span>
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
