"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Duo, LeagueConfig, LeagueState } from "@/types/league";
import { memberKeys, pairsFor } from "@/lib/scoring";
import { PLAYOFF_WEEKS, PUNISHED_PLACES, PUNISHMENTS, SEASON_WEEKS, weekRange } from "@/lib/season";
import { computeBracket, gamesForWeek, isPlayoffWeek, weekLabel } from "@/lib/playoffs";
import {
  dismissTradeAlertAction,
  saveConfigAction,
  setPaidAction,
  syncAction,
  type ActionResult,
} from "@/app/admin/actions";
import { MatchupCard } from "../MatchupCard";
import { WeekChips } from "../WeekChips";

/** Pending flag, last result message and a runner that refreshes the page after a server action. */
export function useAdminRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      setMsg(await fn());
      router.refresh();
    });
  return { msg, pending, run };
}

/** Manager name for a member key such as "d1a". */
export const managerName = (duos: Duo[], key: string) => {
  const duo = duos.find((d) => key.startsWith(d.id));
  return duo ? (key.endsWith("a") ? duo.a : duo.b) : key;
};

/** Settings tab: ESPN sync, buy-ins, league settings, team mapping, punishment picks, schedule, trade alerts. */
export function AdminSettings({ state }: { state: LeagueState }) {
  const [config, setConfig] = useState<LeagueConfig>(state.config);
  const [week, setWeek] = useState(state.currentWeek);
  const { msg, pending, run } = useAdminRun();
  const dirty = JSON.stringify(config) !== JSON.stringify(state.config);

  const patch = (p: Partial<LeagueConfig>) => setConfig((c) => ({ ...c, ...p }));
  const patchDuo = (i: number, p: Partial<LeagueConfig["duos"][number]>) =>
    setConfig((c) => ({ ...c, duos: c.duos.map((d, j) => (j === i ? { ...d, ...p } : d)) }));
  const pairs = pairsFor({ config }, week);
  const setPair = (slot: number, side: 0 | 1, id: string) => {
    const next = pairs.map((p) => [...p] as [string, string]);
    next[slot][side] = id;
    patch({ schedule: { ...config.schedule, [String(week)]: next } });
  };
  const usedTwice = new Set(pairs.flat()).size !== pairs.flat().length;
  // Preview with unsaved settings, so a new pick or season length shows before saving.
  const draft = { ...state, config };
  const bracket = computeBracket(draft);
  const playoffWeek = isPlayoffWeek(draft, week);
  const synced = state.lastSynced ? new Date(state.lastSynced).toLocaleString() : "never";

  return (
    <>
      {msg && <p className={msg.ok ? "ok" : "err"} role="status">{msg.message}</p>}

      {state.tradeAlerts.length > 0 && (
        <section className="card" style={{ borderColor: "var(--loss)" }}>
          <p className="eyebrow" style={{ color: "var(--loss)" }}>Possible teammate trades</p>
          <p className="note" style={{ marginTop: 6 }}>
            These players moved straight from one manager to their duo partner. Check ESPN, reverse it if it breaks the rule, then dismiss.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {state.tradeAlerts.map((a) => (
              <div key={a.id} className="row2" style={{ justifyContent: "space-between" }}>
                <span>
                  <b>{a.playerName}</b>: {managerName(config.duos, a.fromMember)} to {managerName(config.duos, a.toMember)}
                  <span className="note"> · {new Date(a.detectedAt).toLocaleString()}</span>
                </span>
                <button className="btn" disabled={pending} onClick={() => run(() => dismissTradeAlertAction(a.id))}>Dismiss</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <p className="eyebrow">ESPN</p>
        <div className="row2" style={{ marginTop: 8 }}>
          <span>
            {state.espnStatus === "ok" ? "Connected" : state.espnStatus === "private" ? "League is private on ESPN" : "Not connected yet"}
            {" · "}last synced {synced}
          </span>
          <button className="btn" disabled={pending || !state.hasDatabase} onClick={() => run(syncAction)}>Sync now</button>
        </div>
        <p className="note" style={{ marginTop: 8 }}>The site syncs on its own every few minutes while people are viewing it.</p>
      </section>

      <section className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Buy-ins · {Object.values(state.paid).filter(Boolean).length} of {config.duos.length * 2} paid
        </p>
        <div className="fields">
          {config.duos.flatMap((d) =>
            memberKeys(d).map((key, i) => (
              <label key={key} className="switch" style={{ color: "var(--fg)" }}>
                <input type="checkbox" checked={!!state.paid[key]} disabled={pending || !state.hasDatabase}
                  onChange={(e) => run(() => setPaidAction(key, e.target.checked))} />
                <span>{i ? d.b : d.a}</span>
              </label>
            )),
          )}
        </div>
      </section>

      <section className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>League</p>
        <div className="fields">
          <label>League name<input type="text" value={config.name} onChange={(e) => patch({ name: e.target.value })} /></label>
          <label>Buy-in per manager ($)<input type="number" min={0} value={config.buyIn} onChange={(e) => patch({ buyIn: Number(e.target.value) })} /></label>
          <label>
            Regular-season weeks (playoffs add {PLAYOFF_WEEKS})
            <input
              type="number" min={1} max={SEASON_WEEKS - PLAYOFF_WEEKS} value={config.regularWeeks}
              onChange={(e) => {
                const regularWeeks = Number(e.target.value);
                patch({ regularWeeks, weeks: regularWeeks + PLAYOFF_WEEKS });
              }}
            />
          </label>
          <label>
            1st seed&apos;s semifinal pick
            <select value={config.seed1Pick ?? ""} onChange={(e) => patch({ seed1Pick: e.target.value || null })}>
              <option value="">Not picked yet (plays the 4th seed)</option>
              {bracket.seeds.slice(1).map((d, i) => (
                <option key={d.id} value={d.id}>{`Seed ${i + 2}: ${d.name}`}</option>
              ))}
            </select>
          </label>
          <label>
            Current week (blank follows ESPN)
            <input
              type="number" min={1} max={config.weeks} value={config.currentWeekOverride ?? ""}
              onChange={(e) => patch({ currentWeekOverride: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Duos and ESPN teams</p>
        <p className="note" style={{ marginBottom: 10 }}>After the draft, pick which ESPN team each manager owns. Stats only flow in for mapped teams.</p>
        <div className="duoed">
          {config.duos.map((d, i) => (
            <div key={d.id} className="eb" style={{ display: "grid", gap: 8 }}>
              <input type="text" value={d.name} aria-label={`Duo ${i + 1} name`} onChange={(e) => patchDuo(i, { name: e.target.value })} />
              {(["a", "b"] as const).map((side) => {
                const espnKey = side === "a" ? "espnA" : "espnB";
                return (
                  <div key={side} className="mapsel" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
                    <input type="text" value={d[side]} aria-label={`Duo ${i + 1} manager ${side.toUpperCase()}`} onChange={(e) => patchDuo(i, { [side]: e.target.value })} />
                    <select
                      value={d[espnKey] ?? ""}
                      aria-label={`${d[side]}'s ESPN team`}
                      onChange={(e) => patchDuo(i, { [espnKey]: e.target.value === "" ? null : Number(e.target.value) })}
                    >
                      <option value="">ESPN team not set</option>
                      {state.espnTeams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}{t.owner ? ` (${t.owner})` : ""}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Punishment picks (4th picks first, then 5th, then 6th)</p>
        <div className="fields">
          {PUNISHED_PLACES.map((place) => (
            <label key={place}>
              {place}th place picked
              <select
                value={config.punishmentPicks[place] ?? ""}
                onChange={(e) => patch({ punishmentPicks: { ...config.punishmentPicks, [place]: e.target.value || null } })}
              >
                <option value="">Not picked yet</option>
                {PUNISHMENTS.map((p) => {
                  const takenBy = PUNISHED_PLACES.find((other) => other !== place && config.punishmentPicks[other] === p.id);
                  return (
                    <option key={p.id} value={p.id} disabled={!!takenBy}>
                      {p.title}{takenBy ? ` (taken by ${takenBy}th)` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <p className="eyebrow">Schedule · {playoffWeek ? `${weekLabel(draft, week)} · ` : ""}Week {week} · {weekRange(week)}</p>
        <WeekChips weeks={config.weeks} regularWeeks={config.regularWeeks} current={state.currentWeek} selected={week} final={state.final} onPick={setWeek} />
        {playoffWeek ? (
          <p className="note">Playoff matchups come from the bracket: the seeds and the 1st seed&apos;s pick above.</p>
        ) : (
        <div className="editm">
          {pairs.map((p, slot) => (
            <div key={slot} className="pr">
              {([0, 1] as const).map((side) => (
                <span key={side} style={{ display: "contents" }}>
                  {side === 1 && <span className="vs">vs</span>}
                  <select value={p[side]} aria-label={`Matchup ${slot + 1} duo ${side + 1}`} onChange={(e) => setPair(slot, side, e.target.value)}>
                    {config.duos.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </span>
              ))}
            </div>
          ))}
        </div>
        )}
        {!playoffWeek && usedTwice && <p className="warn">A duo appears twice this week. Each duo should play exactly once.</p>}
      </section>

      <div className="banner" style={{ position: "sticky", bottom: 12, zIndex: 4, visibility: dirty ? "visible" : "hidden" }}>
        <span>You have unsaved settings.</span>
        <div className="row2">
          <button className="btn" onClick={() => setConfig(state.config)}>Discard</button>
          <button className="btn primary" disabled={pending || !state.hasDatabase} onClick={() => run(() => saveConfigAction(config))}>Save settings</button>
        </div>
      </div>

      <div className="mcs">
        {gamesForWeek(draft, week, bracket).map((g, i) =>
          g.a && g.b ? (
            <MatchupCard key={`${g.a.id}-${g.b.id}`} state={state} week={week} A={g.a} B={g.b} label={g.label || undefined} seedA={g.seedA} seedB={g.seedB} />
          ) : (
            <p key={i} className="note">{g.label}: teams not set yet.</p>
          ),
        )}
      </div>
    </>
  );
}
