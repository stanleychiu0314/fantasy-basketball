import { formatEt } from "@/lib/season";

/** Small pieces shared by the analytics overview and the week screen. */

const PERCENT = 100;
export const pct = (x: number) => `${Math.round(x * PERCENT)}%`;
export const signed = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;

/** When a saved snapshot was computed, so stale suggestions are obvious. */
export function AsOf({ asOf }: { asOf: Date | string | null }) {
  return <p className="note" style={{ marginTop: 6 }}>{asOf ? `As of ${formatEt(asOf)}` : "Not computed yet"}</p>;
}

/** A 0 to 1 chance as a bar plus its percentage. */
export function Meter({ value }: { value: number }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span className="meter"><i style={{ width: pct(value) }} /></span> <span className="num">{pct(value)}</span>
    </span>
  );
}
