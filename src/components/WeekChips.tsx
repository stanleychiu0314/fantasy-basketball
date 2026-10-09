import { weekRange } from "@/lib/season";

type Props = { weeks: number; regularWeeks: number; current: number; selected: number; final: Record<number, boolean>; onPick: (w: number) => void };

/** Horizontal week picker. A dot marks the current week, finished weeks are dimmed, playoff weeks are gold. */
export function WeekChips({ weeks, regularWeeks, current, selected, final, onPick }: Props) {
  return (
    <div className="weeks">
      {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
        <button
          key={w}
          className={`wk${w === current ? " cur" : ""}${final[w] ? " done" : ""}${w > regularWeeks ? " po" : ""}`}
          aria-pressed={w === selected}
          aria-label={`Week ${w}, ${weekRange(w)}${w > regularWeeks ? ", playoffs" : ""}`}
          title={`${weekRange(w)}${w === regularWeeks + 1 ? " · Semifinals" : w === regularWeeks + 2 ? " · Finals" : ""}`}
          onClick={() => onPick(w)}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
