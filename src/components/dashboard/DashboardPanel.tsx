import type { ReactNode } from "react";
import type { SourceId } from "@/contracts/types";

export function DashboardPanel({ title, subtitle, demo, loading = false, children }: {
  title: string;
  subtitle: string;
  demo: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} aria-busy={loading} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-[#142D4E]">{title}</h2>
        {demo && <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">Demo data — illustrative only</span>}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
      {loading ? <div className="mt-6"><p role="status" className="text-sm text-slate-600">Loading {title.toLowerCase()}…</p><div aria-hidden="true" className="mt-4 h-28 rounded-xl bg-slate-100 motion-safe:animate-pulse" /></div> : <div className="mt-6">{children}</div>}
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

export function SourceNote({ source, demo, url }: { source?: SourceId; demo: boolean; url?: string | null }) {
  const href = demo ? null : safeExternalUrl(url);
  return (
    <div className="mt-5 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
      <p>{demo ? "Fictional source placeholder; not a municipal citation." : href ? "Source record available below." : "Public record link unavailable; source row provided for reference."}</p>
      {source && <p className="mt-1 break-all font-mono">{source}</p>}
      {href && <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded font-medium text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">View source record (opens new tab)</a>}
    </div>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return "Unavailable";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function formatMonth(value: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return "Unavailable";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`));
}

export function formatCount(value: number | null | undefined): string {
  return value != null && Number.isInteger(value) && value >= 0 ? value.toLocaleString("en-CA") : "Unavailable";
}
