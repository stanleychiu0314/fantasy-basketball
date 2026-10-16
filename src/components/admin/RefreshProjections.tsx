"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshProjectionsAction, type ActionResult } from "@/app/admin/actions";

/** Re-pull ESPN projections and actual stats, which also refines the blend. */
export function RefreshProjections() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  return (
    <div className="row2">
      <button
        className="btn primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(await refreshProjectionsAction());
            router.refresh();
          })
        }
      >
        {pending ? "Refreshing…" : "Refresh and refine projections"}
      </button>
      {msg && <span className={msg.ok ? "ok" : "err"} role="status">{msg.message}</span>}
    </div>
  );
}
