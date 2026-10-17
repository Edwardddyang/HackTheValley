import type { ReactNode } from "react";

import type { Cite as CiteData } from "@/lib/brief";
import { num } from "@/lib/format";

import { Cite } from "./Cite";

/** A brief section: an anchor-target card (panel frame from Satwik's feature/frontend). */
export function Section({ id, title, subtitle, actions, children }: {
  id: string; title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm sm:p-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id={`${id}-h`} className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
          {actions}
        </div>
        {subtitle ? <p className="mt-2 max-w-[68ch] text-sm leading-6 text-ink-2">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function Stat({ value, label, cite }: { value: ReactNode; label: ReactNode; cite?: CiteData | null }) {
  return (
    <div>
      <div className="plate num text-[2.4rem] font-bold text-ink">
        {value}
        {cite ? <Cite cite={cite} /> : null}
      </div>
      <div className="mt-1 text-[15px] text-ink-2">{label}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-ink-2">{children}</p>;
}

/** A small "how to read this" or "where this came from" line under a block of facts. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-[68ch] text-sm text-ink-3">{children}</p>;
}

/** Horizontal bars for counts by category (one series, so one colour; no legend needed). */
export function BarList({ items, color, max }: {
  items: { label: string; count: number; note?: string; cite?: CiteData | null }[];
  color: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="text-[15px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink">
              {i.label}
              {i.cite ? <Cite cite={i.cite} /> : null}
            </span>
            <span className="num shrink-0 text-ink">
              {num(i.count)}
              {i.note ? <span className="ml-1.5 text-sm text-ink-3">{i.note}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-1.5 rounded-full" style={{ width: `${(100 * i.count) / top}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** This place's value as a bar, with a tick at the comparison value (city or median). The numbers are written beside it. */
export function CompareBar({ value, compare, max, valueLabel, compareLabel }: {
  value: number | null; compare: number | null; max: number; valueLabel: string; compareLabel: string;
}) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, (100 * n) / (max || 1)))}%`;
  return (
    <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-2" title={`${valueLabel}; ${compareLabel}`} aria-hidden="true">
      {value != null ? <div className="h-1.5 rounded-full bg-accent" style={{ width: pct(value) }} /> : null}
      {compare != null ? (
        <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-ink" style={{ left: `calc(${pct(compare)} - 1px)` }} />
      ) : null}
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-sm text-ink-2">
      {children}
    </span>
  );
}
