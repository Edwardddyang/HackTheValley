"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

const WIDTH = 288; // w-72
const EDGE = 8;

/** A small "i" button that shows a note on demand. Closes on Escape or a click outside. The note opens centred
 *  under the button (over it with `above`, for a button at the bottom of a panel), or anchored to its left or right
 *  edge when centring would run off the screen. */
export function InfoTip({ label, children, above = false }: { label: string; children: ReactNode; above?: boolean }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"center" | "left" | "right">("center");
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

  function toggle() {
    const box = ref.current?.getBoundingClientRect();
    if (!open && box) {
      // The note must fit inside the window and inside the nearest card that clips its overflow or panel that floats
      // over the page (the Ask drawer).
      let left = 0, right = window.innerWidth;
      for (let el = ref.current?.parentElement; el; el = el.parentElement) {
        const style = getComputedStyle(el);
        if (style.overflowX === "visible" && style.position !== "fixed") continue;
        const r = el.getBoundingClientRect();
        left = Math.max(left, r.left);
        right = Math.min(right, r.right);
        break;
      }
      const half = Math.min(WIDTH, window.innerWidth * 0.8) / 2;
      const mid = box.left + box.width / 2;
      setAlign(mid - half < left + EDGE ? "left" : mid + half > right - EDGE ? "right" : "center");
    }
    setOpen((o) => !o);
  }

  const position = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={toggle}
        className="inline-flex size-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-semibold italic text-slate-500 hover:border-[#142D4E] hover:text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
        i
      </button>
      {open && (
        <span id={id} role="note"
          className={`absolute ${above ? "bottom-7" : "top-7"} z-30 w-72 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 font-normal text-slate-600 shadow-lg ${position}`}>
          {children}
        </span>
      )}
    </span>
  );
}
