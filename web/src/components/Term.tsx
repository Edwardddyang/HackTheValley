"use client";

import { type ReactNode, useId, useState } from "react";

/**
 * A bolded term that opens a short plain-language definition on click, for jargon like "311 service requests".
 * Closes on a second click, on Escape, or when focus leaves it.
 */
export function Term({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false);
        }}
        className="font-semibold text-ink underline decoration-dotted decoration-ink-3 underline-offset-4 hover:text-accent"
      >
        {label}
        <span className="sr-only"> (what is this?)</span>
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="absolute left-0 top-full z-20 mt-1.5 block w-80 max-w-[80vw] rounded-md border border-border bg-surface p-3 text-sm font-normal leading-relaxed text-ink shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
