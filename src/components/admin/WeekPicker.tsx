"use client";

import { useRouter } from "next/navigation";
import { weekRange } from "@/lib/season";

/** Jumps to any week's screen, from Week 1 up to next week. */
export function WeekPicker({ last, current }: { last: number; current?: number }) {
  const router = useRouter();
  return (
    <select
      className="btn"
      aria-label="Open a week"
      value={current ?? ""}
      onChange={(e) => router.push(`/admin/analytics/week/${e.target.value}`)}
    >
      {current === undefined && <option value="" disabled>Open a week…</option>}
      {Array.from({ length: last }, (_, i) => i + 1).map((w) => (
        <option key={w} value={w}>Week {w} · {weekRange(w)}</option>
      ))}
    </select>
  );
}
