"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export type BriefTab = { id: string; label: string; badge?: string | null; content: ReactNode };

/**
 * Tabs for the brief. Every panel is rendered once on the server; this only shows one tab at a time.
 * The selected tab lives in the URL hash (#construction) so links, reloads and Back work.
 * Keyboard: Left/Right/Home/End move between tabs (WAI-ARIA tabs pattern, automatic activation).
 */
export function BriefTabs({ tabs }: { tabs: BriefTab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const barRef = useRef<HTMLDivElement>(null);

  // Follow the hash: on load, on Back/Forward, and when a panel links to "#tab-id".
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function select(id: string, focus = false) {
    setActive(id);
    if (window.location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
    if (focus) buttons.current[id]?.focus();
    buttons.current[id]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Bring the top of the tab content into view if the reader had scrolled past it.
    const bar = barRef.current;
    if (bar && bar.getBoundingClientRect().top <= 0) bar.scrollIntoView({ block: "start" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    const next = event.key === "ArrowRight" ? (i + 1) % tabs.length
      : event.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    select(tabs[next].id, true);
  }

  return (
    <div>
      <div ref={barRef} className="sticky top-0 z-20 -mx-6 border-b border-slate-200 bg-[#F8FAFC]/95 px-6 backdrop-blur lg:-mx-10 lg:px-10">
        <div role="tablist" aria-label="Brief sections" onKeyDown={onKeyDown}
          className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {tabs.map((t) => {
            const selected = t.id === active;
            return (
              <button key={t.id} ref={(el) => { buttons.current[t.id] = el; }}
                id={`tab-${t.id}`} role="tab" type="button" aria-selected={selected} aria-controls={`tabpanel-${t.id}`}
                tabIndex={selected ? 0 : -1} onClick={() => select(t.id)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700 ${
                  selected ? "border-teal-700 text-[#142D4E]" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-[#142D4E]"
                }`}>
                {t.label}
                {t.badge ? <span className={`ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums ${selected ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{t.badge}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`tabpanel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={t.id !== active}
          className="pt-6 focus-visible:outline-none" tabIndex={0}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
