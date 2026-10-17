import type { ReactNode } from "react";

import type { Cite as CiteData } from "@/lib/brief";
import { datasetName, num } from "@/lib/format";

// Panel frame and helpers from feature/frontend (Satwik), wired to real citations.

export function DashboardPanel({ id, title, subtitle, wide = false, children }: {
  id?: string;
  title: string;
  subtitle: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title}
      className={`min-w-0 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 ${wide ? "md:col-span-2" : ""}`}>
      <h2 className="text-xl font-semibold tracking-tight text-[#142D4E]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function Unavailable({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{children}</p>;
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

export function citeText(cite: CiteData): string {
  const name = datasetName(cite.dataset).long;
  if ("row_count" in cite) {
    return `${name} · ${cite.file} · ${num(cite.row_count)} rows` +
      (cite.sample_rows?.length ? ` (e.g. ${cite.sample_rows.map(num).join(", ")})` : "");
  }
  if ("column_hood_id" in cite) return `${name} · ${cite.file} · row ${num(cite.row)}, neighbourhood ${cite.column_hood_id}`;
  return `${name} · ${cite.file} · row ${num(cite.row)}`;
}

/** Footer line naming the dataset row(s) a panel or card came from, with an optional public record link. */
export function SourceNote({ cite, url, label = "Source" }: { cite?: CiteData | null; url?: string | null; label?: string }) {
  const href = safeExternalUrl(url);
  if (!cite && !href) return null;
  return (
    <div className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
      {cite && <p><span className="font-medium text-slate-600">{label}:</span> <span className="break-words">{citeText(cite)}</span></p>}
      {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded font-medium text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">View the City&apos;s record (opens new tab)</a>}
    </div>
  );
}

/** A row of label/value pairs in the panels' definition-list style. */
export function Facts({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 2 | 3 | 4 }) {
  const grid = cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2";
  return (
    <dl className={`grid ${grid} gap-x-5 gap-y-5 text-sm`}>
      {items.map(([k, v], i) => (
        <div key={i}><dt className="text-slate-500">{k}</dt><dd className="mt-1 font-medium text-slate-800">{v}</dd></div>
      ))}
    </dl>
  );
}

/** Thin horizontal bars for counts by category (one series, one colour). */
export function BarList({ items, color = "#0f766e" }: {
  items: { label: string; count: number; note?: string; cite?: CiteData | null }[];
  color?: string;
}) {
  const top = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label} className="text-sm" title={i.cite ? citeText(i.cite) : undefined}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-slate-700">{i.label}</span>
            <span className="shrink-0 tabular-nums font-semibold text-[#142D4E]">
              {num(i.count)}{i.note ? <span className="ml-1.5 font-normal text-slate-500">{i.note}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full" style={{ width: `${(100 * i.count) / top}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Status colours: the dataviz skill's validated status palette. A status colour never carries
// meaning alone; StatusTag always pairs it with an icon and words.
export type Status = "good" | "fair" | "poor";
export const STATUS_COLOR: Record<Status, string> = { good: "#0ca30c", fair: "#fab219", poor: "#d03b3b" };
const STATUS_ICON: Record<Status, string> = { good: "●", fair: "◆", poor: "▲" };
const NEUTRAL_BAR = "#64748b";

/**
 * Rates a value against a reference (city rate, city median or neighbourhood median).
 * - "higher-worse": more than `tolerance` (relative) below the reference is good, within it fair, above it poor.
 * - "higher-better" with `points`: at/above the reference is good, up to `points` below fair, further below poor.
 * Returns null when there's nothing to compare, so the bar stays neutral.
 */
export function rate(value: number | null | undefined, reference: number | null | undefined,
  rule: { direction: "higher-worse"; tolerance: number } | { direction: "higher-better"; points: number }): Status | null {
  if (value == null || reference == null || !Number.isFinite(value) || !Number.isFinite(reference)) return null;
  if (rule.direction === "higher-better") {
    if (value >= reference) return "good";
    return value >= reference - rule.points ? "fair" : "poor";
  }
  if (reference <= 0) return value <= 0 ? "good" : "poor";
  const ratio = value / reference;
  if (ratio < 1 - rule.tolerance) return "good";
  return ratio <= 1 + rule.tolerance ? "fair" : "poor";
}

/** RentSafeTO scores vs the city median: at/above is green, up to 10 points below yellow, further below red. */
export const SCORE_RULE = { direction: "higher-better", points: 10 } as const;
export const SCORE_LABEL: Record<Status, string> = {
  good: "At or above the city median", fair: "Up to 10 points below the median", poor: "More than 10 points below the median",
};

/** Coloured dot/diamond/triangle plus words, so the rating reads without colour. */
export function StatusTag({ status, label }: { status: Status | null; label: string }) {
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-600">
      <span aria-hidden style={{ color: STATUS_COLOR[status] }}>{STATUS_ICON[status]}</span>{label}
    </span>
  );
}

export function StatusLegend({ good, fair, poor }: { good: string; fair: string; poor: string }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <StatusTag status="good" label={good} /><StatusTag status="fair" label={fair} /><StatusTag status="poor" label={poor} />
    </p>
  );
}

/** This place's value as a bar, with a tick for the comparison (city figure or neighbourhood median).
 *  The fill takes the status colour when the value is rated, and stays neutral otherwise. */
export function CompareBar({ value, compare, max, title, status = null }: {
  value: number | null; compare: number | null; max: number; title: string; status?: Status | null;
}) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, (100 * n) / (max || 1)))}%`;
  return (
    <div className="relative mt-2 h-2 rounded-full bg-slate-100" title={title}>
      {value != null && <div className="h-2 rounded-full" style={{ width: pct(value), background: status ? STATUS_COLOR[status] : NEUTRAL_BAR }} />}
      {compare != null && <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-[#142D4E]" style={{ left: `calc(${pct(compare)} - 1px)` }} />}
    </div>
  );
}

/** A panel's list of records, shown in full: each list already has a tab of its own. */
export function ItemList({ items }: { items: ReactNode[] }) {
  return <ul className="space-y-4">{items}</ul>;
}
