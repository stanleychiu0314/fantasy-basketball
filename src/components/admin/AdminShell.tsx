import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";

export const ADMIN_TABS = [
  ["analytics", "Analytics"],
  ["scores", "Correct scores"],
  ["settings", "Settings"],
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number][0];

/** The `?tab=` value, falling back to Analytics for anything unknown. */
export const parseTab = (raw: string | string[] | undefined): AdminTab =>
  ADMIN_TABS.find(([id]) => id === raw)?.[0] ?? "analytics";

/** Admin chrome: header, no-database banner and the three tabs (plain links, so each tab renders on the server). */
export function AdminShell({ tab, name, hasDatabase, children }: { tab: AdminTab; name: string; hasDatabase: boolean; children: React.ReactNode }) {
  return (
    <div className="wrap adm">
      <header className="top" style={{ paddingBlock: 0 }}>
        <div>
          <p className="eyebrow">Commissioner</p>
          <h1>{name} <span>admin</span></h1>
        </div>
        <div className="pills">
          <Link className="btn" href="/">View site</Link>
          <form action={logoutAction}><button className="btn" type="submit">Log out</button></form>
        </div>
      </header>

      <nav className="nav" aria-label="Admin sections" style={{ marginBottom: 0 }}>
        <div className="nav-in" role="tablist">
          {ADMIN_TABS.map(([id, label]) => (
            <Link key={id} className="tab" role="tab" aria-selected={tab === id} href={id === "analytics" ? "/admin" : `/admin?tab=${id}`}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {!hasDatabase && (
        <div className="banner">No database is connected, so nothing here can be saved yet. Add Neon in Vercel, then redeploy.</div>
      )}
      {children}
    </div>
  );
}
