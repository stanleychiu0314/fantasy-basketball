"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recomputeTradesAction, recomputeWeekMovesAction, type ActionResult } from "@/app/admin/actions";

/** Recompute a saved snapshot now: a week's moves when `week` is given, otherwise trade ideas. */
export function RecomputeButton({ week }: { week?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <div className="row2">
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(await (week === undefined ? recomputeTradesAction() : recomputeWeekMovesAction(week)));
            router.refresh();
          })
        }
      >
        {pending ? "Recomputing…" : "Recompute now"}
      </button>
      {msg && <span className={msg.ok ? "ok" : "err"} role="status">{msg.message}</span>}
    </div>
  );
}
