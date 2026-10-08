"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/admin/actions";

export function LoginForm() {
  const [result, action, pending] = useActionState(loginAction, null);
  return (
    <div className="wrap">
      <form className="card login" action={action}>
        <h1 className="h2">Commissioner</h1>
        <label className="fields" htmlFor="password" style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Password</span>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Checking…" : "Log in"}</button>
        {result && !result.ok && <p className="warn">{result.message}</p>}
        <Link className="note" href="/">Back to the league</Link>
      </form>
    </div>
  );
}
