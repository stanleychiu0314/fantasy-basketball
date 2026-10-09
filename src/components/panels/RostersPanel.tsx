import type { LeagueState } from "@/types/league";
import { memberKeys } from "@/lib/scoring";
import { IR_SLOTS, ROSTER_SIZE } from "@/lib/season";

/** Each duo's two ESPN rosters, side by side, with injured reserve listed separately. */
export function RostersPanel({ state }: { state: LeagueState }) {
  const total = state.config.duos.length * 2 * ROSTER_SIZE;
  const filled = Object.values(state.rosters).reduce((n, r) => n + r.filter((p) => !p.ir).length, 0);
  const teamName = (id: number | null) => state.espnTeams.find((t) => t.id === id)?.name;

  return (
    <>
      <div>
        <h2 className="h2">Rosters</h2>
        <p className="lede">
          Every team carries {ROSTER_SIZE} players (10 starters, 3 bench) plus up to {IR_SLOTS} on injured reserve.
          Rosters update from ESPN after the draft and after every move.
        </p>
        <p className="note" style={{ marginTop: 10 }}>{filled ? `${filled} of ${total} roster spots filled` : "The draft has not happened yet."}</p>
        <div className="prog"><i style={{ width: `${(filled / total) * 100}%` }} /></div>
      </div>
      {state.config.duos.map((d) => (
        <section key={d.id} className="eb">
          <h4>{d.name}</h4>
          <div className="rost">
            {memberKeys(d).map((key, i) => {
              const players = state.rosters[key] ?? [];
              const active = players.filter((p) => !p.ir);
              const ir = players.filter((p) => p.ir);
              const espnName = teamName(i ? d.espnB : d.espnA);
              return (
                <div key={key} className="team">
                  <h5>
                    {i ? d.b : d.a}{espnName ? ` · ${espnName}` : ""}
                    <span>{active.length}/{ROSTER_SIZE}{ir.length ? ` + ${ir.length} IR` : ""}</span>
                  </h5>
                  {players.length ? (
                    <>
                      <ol className="clean" style={{ margin: 0, color: "var(--fg)" }}>
                        {active.map((p) => <li key={p.name}>{p.name}</li>)}
                      </ol>
                      {ir.length > 0 && (
                        <p className="note" style={{ marginTop: 8 }}>
                          <span className="tag hi">IR</span> {ir.map((p) => p.name).join(", ")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="note">No players yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
