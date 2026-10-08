import type { LeagueState } from "@/types/league";
import { memberKeys } from "@/lib/scoring";
import { ROSTER_SIZE } from "@/lib/season";

/** Each duo's two ESPN rosters, side by side. */
export function RostersPanel({ state }: { state: LeagueState }) {
  const total = state.config.duos.length * 2 * ROSTER_SIZE;
  const filled = Object.values(state.rosters).reduce((n, r) => n + r.length, 0);
  const teamName = (id: number | null) => state.espnTeams.find((t) => t.id === id)?.name;

  return (
    <>
      <div>
        <h2 className="h2">Rosters</h2>
        <p className="lede">Every team carries {ROSTER_SIZE} players. Rosters update from ESPN after the draft and after every move.</p>
        <p className="note" style={{ marginTop: 10 }}>{filled ? `${filled} of ${total} roster spots filled` : "The draft has not happened yet."}</p>
        <div className="prog"><i style={{ width: `${(filled / total) * 100}%` }} /></div>
      </div>
      {state.config.duos.map((d) => (
        <section key={d.id} className="eb">
          <h4>{d.name}</h4>
          <div className="rost">
            {memberKeys(d).map((key, i) => {
              const players = state.rosters[key] ?? [];
              const espnName = teamName(i ? d.espnB : d.espnA);
              return (
                <div key={key} className="team">
                  <h5>
                    {i ? d.b : d.a}{espnName ? ` · ${espnName}` : ""}
                    <span>{players.length}/{ROSTER_SIZE}</span>
                  </h5>
                  {players.length ? (
                    <ol className="clean" style={{ margin: 0, color: "var(--fg)" }}>
                      {players.map((p) => <li key={p}>{p}</li>)}
                    </ol>
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
