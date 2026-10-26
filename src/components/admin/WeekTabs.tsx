"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

type Tab = { id: string; label: string; panel: ReactNode };

const onHashChange = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
const readHash = () => window.location.hash.slice(1);
// The server has no hash, so it always renders the first tab.
const noHash = () => "";

/** Tab switch for the week screen. The open tab lives in the URL hash so a reload or shared link keeps it. */
export function WeekTabs({ tabs }: { tabs: Tab[] }) {
  const hash = useSyncExternalStore(onHashChange, readHash, noHash);
  const open = tabs.some((t) => t.id === hash) ? hash : tabs[0]?.id;
  return (
    <>
      <nav className="nav" aria-label="Week sections">
        <div className="nav-in" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              className="tab"
              role="tab"
              aria-selected={open === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => (window.location.hash = t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={open !== t.id} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {t.panel}
        </div>
      ))}
    </>
  );
}

/** Tabs inside a tab (Rosters: Stats and Schedule). Local state, so the page's hash keeps the outer tab. */
export function SubTabs({ id, label, tabs }: { id: string; label: string; tabs: Tab[] }) {
  const [open, setOpen] = useState(tabs[0]?.id);
  return (
    <>
      <div className="nav-in" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${id}-tab-${t.id}`}
            className="tab"
            role="tab"
            aria-selected={open === t.id}
            aria-controls={`${id}-panel-${t.id}`}
            onClick={() => setOpen(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`${id}-panel-${t.id}`} role="tabpanel" aria-labelledby={`${id}-tab-${t.id}`} hidden={open !== t.id} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {t.panel}
        </div>
      ))}
    </>
  );
}
