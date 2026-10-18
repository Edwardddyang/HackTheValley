import {
  AirVent, CircleAlert, ClipboardCheck, DollarSign, HardHat, type LucideIcon, ShieldAlert, Wallet, Wrench,
} from "lucide-react";

import { Cite } from "@/components/Cite";
import type { Figure, Flag } from "@/lib/flags";

// What to flag: up to three standout deviations, each a computed headline, a small figure drawn from the same
// numbers, and its sources behind an ⓘ. Rendered on the server from the brief; no AI involved.

const RED = "#d03b3b";
const GREY = "#94a3b8";
const NAVY = "#142D4E";

/** One icon per kind of flag (lib/flags.ts keys), the same as elsewhere in the app for the same thing. */
const FLAG_ICON: Record<string, LucideIcon> = {
  score: ClipboardCheck,
  rent: DollarSign,
  construction: HardHat,
  crime: ShieldAlert,
  cooling: AirVent,
  "census-median_rent_monthly": DollarSign,
  "census-pct_tenants_30pct_on_shelter": Wallet,
  "census-dwellings_major_repairs": Wrench,
};

export function FlagsPanel({ flags }: { flags: Flag[] }) {
  return (
    <section id="flags" aria-labelledby="flags-title"
      className="min-w-0 rounded-2xl border border-teal-200 bg-teal-50/60 p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <h2 id="flags-title" className="text-xl font-semibold tracking-tight text-[#142D4E]">What to flag</h2>
      {flags.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700">Nothing in the records stands out for this address.</p>
      ) : (
        <ul className="mt-4 grid gap-4 lg:grid-cols-3">
          {flags.map((f) => (
            <li key={f.key} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-start gap-2.5 text-[15px] font-semibold leading-snug text-[#142D4E]">
                {(() => {
                  const Icon = FLAG_ICON[f.key] ?? CircleAlert;
                  return <span aria-hidden className="mt-px flex size-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#d03b3b]"><Icon size={15} strokeWidth={2.25} /></span>;
                })()}
                <span>{f.headline}</span>
              </p>
              {f.detail && <p className="mt-1 text-sm text-slate-600">{f.detail}</p>}
              <div className="mt-3 flex-1"><FigureView figure={f.figure} /></div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <a href={`#${f.tab}`} className="rounded font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700">
                  See details →
                </a>
                <details className="group relative">
                  <summary aria-label="Sources" className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:border-teal-700 hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-700">
                    i
                  </summary>
                  <div className="absolute right-0 z-10 mt-1 w-max max-w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                    <p className="mb-1 text-[11px] text-slate-500">Sources</p>
                    {f.cites.map((c, i) => <Cite key={i} cite={c} />)}
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FigureView({ figure }: { figure: Figure }) {
  switch (figure.kind) {
    case "score": return <ScoreFigure {...figure} />;
    case "compare": return <CompareFigure {...figure} />;
    case "distance": return <DistanceFigure {...figure} />;
    default: return null;
  }
}

function ScoreFigure({ score, median, trend }: Extract<Figure, { kind: "score" }>) {
  return (
    <div role="img" aria-label={`Score ${score} out of 100${median != null ? `; city median ${median}` : ""}`}>
      <div className="relative h-2.5 rounded-full bg-slate-100">
        <div className="h-2.5 rounded-full" style={{ width: `${score}%`, background: RED }} />
        {median != null && <div className="absolute -top-1 h-[18px] w-0.5 rounded-full" style={{ left: `calc(${median}% - 1px)`, background: NAVY }} />}
      </div>
      <div className="relative mt-1 h-4 text-[11px] tabular-nums text-slate-500">
        <span className="absolute left-0">0</span>
        {median != null && <span className="absolute -translate-x-full pr-1" style={{ left: `${median}%` }}>city median {median}</span>}
        <span className="absolute right-0">100</span>
      </div>
      {trend.length >= 2 && (
        <div className="mt-2 flex items-end gap-1.5" aria-hidden="true">
          {trend.map((t) => (
            <div key={t.label} className="flex flex-col items-center">
              <span className="text-[10px] font-semibold tabular-nums text-slate-600">{t.score}</span>
              <div className="w-5 rounded-sm" style={{ height: `${Math.max(4, t.score * 0.32)}px`, background: t === trend[trend.length - 1] ? RED : GREY }} />
              <span className="mt-0.5 text-[9px] text-slate-500">{t.label.replace(/^\w+ /, "")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompareFigure({ unit, mine, other }: Extract<Figure, { kind: "compare" }>) {
  const max = Math.max(mine.value, other.value) * 1.1 || 1;
  const row = (r: { label: string; value: number; text: string }, color: string) => (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
      <span className="truncate text-slate-600">{r.label}</span>
      <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${(100 * r.value) / max}%`, background: color }} /></div>
      <span className="font-semibold tabular-nums text-[#142D4E]">{r.text}</span>
    </div>
  );
  return (
    <div role="img" aria-label={`${mine.label}: ${mine.text}; ${other.label}: ${other.text}, ${unit}`} className="space-y-1.5">
      {row(mine, RED)}
      {row(other, GREY)}
      <p className="text-[11px] text-slate-500">{unit}</p>
    </div>
  );
}

function DistanceFigure({ radius_m, distances }: Extract<Figure, { kind: "distance" }>) {
  const at = (d: number) => `${Math.min(100, (100 * d) / radius_m)}%`;
  const nearest = distances[0];
  return (
    <div role="img" aria-label={`${distances.length} major projects within ${radius_m} m; nearest ${Math.round(nearest)} m`}>
      <div className="relative h-6">
        <div className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 bg-slate-200" />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: "0%", background: NAVY }} />
        {distances.map((d, i) => (
          <div key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
            style={{ left: at(d), width: i === 0 ? 12 : 8, height: i === 0 ? 12 : 8, background: i === 0 ? RED : "#e8885a" }} />
        ))}
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-slate-500">
        <span>This address</span><span>{radius_m / 2} m</span><span>{radius_m} m</span>
      </div>
    </div>
  );
}
