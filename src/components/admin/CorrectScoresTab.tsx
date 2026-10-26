"use client";

import { useState } from "react";
import type { LeagueState, ScoreEdit, StatLine } from "@/types/league";
import { FIELDS, FIELD_LABEL, emptyLine, memberKeys } from "@/lib/scoring";
import { formatEt, weekRange } from "@/lib/season";
import { weekLabel, isPlayoffWeek } from "@/lib/playoffs";
import { saveStatsAction, setFinalAction } from "@/app/admin/actions";
import { WeekChips } from "../WeekChips";
import { managerName, useAdminRun } from "./AdminApp";

/** Correct scores tab: pick a week, fix ESPN's numbers by hand, mark the week final, review past edits. */
export function CorrectScores({ state, edits }: { state: LeagueState; edits: ScoreEdit[] }) {
  const { config } = state;
  const { msg, pending, run } = useAdminRun();
  const [week, setWeek] = useState(state.currentWeek);

  return (
    <>
      {msg && <p className={msg.ok ? "ok" : "err"} role="status">{msg.message}</p>}

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <p className="eyebrow">{isPlayoffWeek(state, week) ? `${weekLabel(state, week)} · ` : ""}Week {week} · {weekRange(week)}</p>
        <WeekChips weeks={config.weeks} regularWeeks={config.regularWeeks} current={state.currentWeek} selected={week} final={state.final} onPick={setWeek} />
        <label className="switch">
          <input type="checkbox" checked={!!state.final[week]} disabled={pending || !state.hasDatabase}
            onChange={(e) => run(() => setFinalAction(week, e.target.checked))} />
          <span>Week final</span>
        </label>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
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
                    <td>{formatEt(e.createdAt)}</td>
                    <td>{e.week}</td>
                    <td>{managerName(config.duos, e.member)}</td>
                    <td>{e.action === "revert" ? "Reverted to ESPN" : describeChange(e.oldStats, e.newStats)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
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
