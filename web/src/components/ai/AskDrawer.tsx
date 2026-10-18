"use client";

import { useEffect, useId, useRef, useState } from "react";

import { AskPanel } from "./AskPanel";

// Ask lives in a chat panel on the right instead of a tab, so a question can be asked while reading any tab.
// The panel stays mounted when closed (hidden with `inert`), so the conversation survives closing and reopening.
// It doesn't block the page: no backdrop, and the brief stays scrollable and clickable beside it.

export function AskDrawer(props: Parameters<typeof AskPanel>[0]) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    toggle.current?.focus();
  }

  return (
    <>
      <button ref={toggle} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls={`${ids}-panel`}
        className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#142D4E] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${open ? "pointer-events-none opacity-0" : "opacity-100"}`}>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V14h0a2.5 2.5 0 0 1-2-2.5v-7Z" />
        </svg>
        Ask about this address
      </button>

      <aside ref={panel} id={`${ids}-panel`} aria-labelledby={`${ids}-h`} inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-white transition-transform duration-200 motion-reduce:transition-none sm:w-[420px] ${open ? "translate-x-0 shadow-2xl shadow-slate-900/20" : "translate-x-full"}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={`${ids}-h`} className="text-lg font-semibold tracking-tight text-[#142D4E]">Ask about this address</h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">Answered only from the records in this brief, with sources.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close the Ask panel"
            className="-mr-1 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-700">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <AskPanel {...props} />
      </aside>
    </>
  );
}
