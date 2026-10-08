"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeagueConfig, LeagueState, ScoreEdit, StatLine } from "@/types/league";
import { FIELDS, FIELD_LABEL, emptyLine, memberKeys, pairsFor } from "@/lib/scoring";
import { weekRange } from "@/lib/season";
import {
  dismissTradeAlertAction,
  logoutAction,
  saveConfigAction,
  saveStatsAction,
  setFinalAction,
  setPaidAction,
  syncAction,
  type ActionResult,
} from "@/app/admin/actions";
import { MatchupCard } from "../MatchupCard";
import { WeekChips } from "../WeekChips";

type Props = { state: LeagueState; edits: ScoreEdit[] };

/** Commissioner tools: ESPN sync, league settings, team mapping, schedule and score corrections. */
export function AdminApp({ state, edits }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<LeagueConfig>(state.config);
  const [week, setWeek] = useState(state.currentWeek);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(config) !== JSON.stringify(state.config);

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      router.refresh();
    });

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
  const managerName = (key: string) => {
    const duo = config.duos.find((d) => key.startsWith(d.id));
    return duo ? (key.endsWith("a") ? duo.a : duo.b) : key;
  };
  const synced = state.lastSynced ? new Date(state.lastSynced).toLocaleString() : "never";

  return (
    <div className="wrap adm">
      <header className="top" style={{ paddingBlock: 0 }}>
        <div>
          <p className="eyebrow">Commissioner</p>
          <h1>{config.name} <span>admin</span></h1>
        </div>
        <div className="pills">
          <Link className="btn" href="/">View site</Link>
          <form action={logoutAction}><button className="btn" type="submit">Log out</button></form>
        </div>
      </header>

      {!state.hasDatabase && (
        <div className="banner">No database is connected, so nothing here can be saved yet. Add Neon in Vercel, then redeploy.</div>
      )}
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
                  <b>{a.playerName}</b>: {managerName(a.fromMember)} to {managerName(a.toMember)}
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
          <label>Weeks in season<input type="number" min={1} max={30} value={config.weeks} onChange={(e) => patch({ weeks: Number(e.target.value) })} /></label>
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
        <p className="eyebrow" style={{ marginBottom: 10 }}>Punishments, 4th to 6th place</p>
        <div className="pued">
          {(["4", "5", "6"] as const).map((k) => (
            <div key={k} className="pr2">
              <input type="text" value={config.punishments[k].title} aria-label={`${k}th place title`}
                onChange={(e) => patch({ punishments: { ...config.punishments, [k]: { ...config.punishments[k], title: e.target.value } } })} />
              <input type="text" value={config.punishments[k].text} aria-label={`${k}th place punishment`}
                onChange={(e) => patch({ punishments: { ...config.punishments, [k]: { ...config.punishments[k], text: e.target.value } } })} />
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <p className="eyebrow">Week {week} · {weekRange(week)}</p>
        <WeekChips weeks={config.weeks} current={state.currentWeek} selected={week} final={state.final} onPick={setWeek} />
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
        {usedTwice && <p className="warn">A duo appears twice this week. Each duo should play exactly once.</p>}
        <label className="switch">
          <input type="checkbox" checked={!!state.final[week]} disabled={pending || !state.hasDatabase}
            onChange={(e) => run(() => setFinalAction(week, e.target.checked))} />
          <span>Week final</span>
        </label>
      </section>

      <div className="banner" style={{ position: "sticky", bottom: 12, zIndex: 4, visibility: dirty ? "visible" : "hidden" }}>
        <span>You have unsaved settings.</span>
        <div className="row2">
          <button className="btn" onClick={() => setConfig(state.config)}>Discard</button>
          <button className="btn primary" disabled={pending || !state.hasDatabase} onClick={() => run(() => saveConfigAction(config))}>Save settings</button>
        </div>
      </div>

      <div className="mcs">
        {pairs.map(([a, b]) => {
          const A = config.duos.find((d) => d.id === a);
          const B = config.duos.find((d) => d.id === b);
          return A && B ? <MatchupCard key={`${a}-${b}`} state={state} week={week} A={A} B={B} /> : null;
        })}
      </div>

      <section style={{ display: "grid", gap: 12 }}>
        <div>
          <h2 className="h2" style={{ fontSize: "1.7rem" }}>Correct scores</h2>
          <p className="note">Only needed if ESPN is wrong or missing a week. A saved row is marked manual and ESPN will not overwrite it.</p>
        </div>
        {config.duos.map((d) =>
          memberKeys(d).map((key, i) => (
            <StatRow
              key={`${week}-${key}`}
              label={`${i ? d.b : d.a} (${d.name})`}
              stats={state.scores[week]?.[key] ?? null}
              isManual={state.manual.some((m) => m.week === week && m.member === key)}
              disabled={pending || !state.hasDatabase}
              onSave={(s) => run(() => saveStatsAction(week, key, s))}
              onRevert={() => run(() => saveStatsAction(week, key, null))}
            />
          )),
        )}
      </section>

      <section className="card">
        <p className="eyebrow">Score edit history</p>
        {edits.length === 0 ? (
          <p className="note" style={{ marginTop: 8 }}>No manual changes yet.</p>
        ) : (
          <div className="scroll" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>When</th><th>Week</th><th>Manager</th><th>Change</th></tr></thead>
              <tbody>
                {edits.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>{e.week}</td>
                    <td>{managerName(e.member)}</td>
                    <td>{e.action === "revert" ? "Reverted to ESPN" : describeChange(e.oldStats, e.newStats)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** "PTS 410 to 432, REB 180 to 175" for the fields that changed. */
function describeChange(before: StatLine | null, after: StatLine | null): string {
  if (!after) return "Cleared";
  if (!before) return "Entered by hand (no ESPN data)";
  const changed = FIELDS.filter((f) => before[f] !== after[f]).map((f) => `${FIELD_LABEL[f]} ${before[f]} to ${after[f]}`);
  return changed.length ? changed.join(", ") : "No change";
}

type RowProps = {
  label: string;
  stats: StatLine | null;
  isManual: boolean;
  disabled: boolean;
  onSave: (s: StatLine) => void;
  onRevert: () => void;
};

/** One ESPN team's line for the selected week, editable as a manual override. */
function StatRow({ label, stats, isManual, disabled, onSave, onRevert }: RowProps) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f, stats ? String(stats[f]) : ""])),
  );
  const changed = FIELDS.some((f) => draft[f] !== (stats ? String(stats[f]) : ""));

  /** Paste 11 numbers in order into any box to fill the row. */
  const onPaste = (e: React.ClipboardEvent) => {
    const nums = e.clipboardData.getData("text").match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < FIELDS.length) return;
    e.preventDefault();
    setDraft(Object.fromEntries(FIELDS.map((f, i) => [f, nums[i]])));
  };

  const save = () => {
    const line = emptyLine();
    for (const f of FIELDS) line[f] = Number(draft[f]) || 0;
    onSave(line);
  };

  return (
    <div className="eb">
      <div className="row2" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <b>{label}</b>
        <span className={`src${isManual ? " manual" : ""}`}>{isManual ? "Manual" : stats ? "ESPN" : "No data"}</span>
      </div>
      <div className="scroll">
        <table>
          <thead><tr>{FIELDS.map((f) => <th key={f} style={{ textAlign: "right" }}>{FIELD_LABEL[f]}</th>)}</tr></thead>
          <tbody>
            <tr>
              {FIELDS.map((f) => (
                <td key={f}>
                  <input type="text" inputMode="numeric" value={draft[f]} aria-label={`${label} ${FIELD_LABEL[f]}`}
                    onPaste={onPaste} onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row2" style={{ marginTop: 8 }}>
        <button className="btn" disabled={disabled || !changed} onClick={save}>Save as manual</button>
        {isManual && <button className="btn" disabled={disabled} onClick={onRevert}>Use ESPN numbers</button>}
      </div>
    </div>
  );
}
