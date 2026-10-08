import { weekRange } from "@/lib/season";

type Props = { weeks: number; current: number; selected: number; final: Record<number, boolean>; onPick: (w: number) => void };

/** Horizontal week picker. A dot marks the current week; finished weeks are dimmed. */
export function WeekChips({ weeks, current, selected, final, onPick }: Props) {
  return (
    <div className="weeks">
      {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
        <button
          key={w}
          className={`wk${w === current ? " cur" : ""}${final[w] ? " done" : ""}`}
          aria-pressed={w === selected}
          aria-label={`Week ${w}, ${weekRange(w)}`}
          title={weekRange(w)}
          onClick={() => onPick(w)}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
