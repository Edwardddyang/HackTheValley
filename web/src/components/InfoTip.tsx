"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

/** A small "i" button that shows a note on demand. Closes on Escape or a click outside. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="inline-flex size-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold italic text-slate-500 hover:border-[#142D4E] hover:text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
        i
      </button>
      {open && (
        <span id={id} role="note"
          className="absolute top-7 left-1/2 z-30 w-72 max-w-[80vw] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 font-normal text-slate-600 shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}
