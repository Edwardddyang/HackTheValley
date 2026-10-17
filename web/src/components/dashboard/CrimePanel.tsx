import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { OFFENCE_LABELS, num } from "@/lib/format";

import { CompareBar, DashboardPanel, Unavailable } from "./DashboardPanel";

export default function CrimePanel({ brief }: { brief: Brief }) {
  const c = brief.crime;
  const hood = brief.area.neighbourhood?.name ?? "this neighbourhood";
  return (
    <DashboardPanel id="crime" title={`Crime in ${hood}, ${c.year}`}
      subtitle={<>Incidents per 100,000 people. Bar: {hood}; tick: all of Toronto.</>}>
      {c.offences.length === 0 ? <Unavailable>No crime figures for this neighbourhood.</Unavailable> : (
        <ul className="space-y-4">
          {c.offences.map((o) => {
            const max = Math.max(o.rate_per_100k, o.city_rate_per_100k ?? 0) * 1.15;
            const change = o.previous_year_rate != null ? Math.round((o.rate_per_100k - o.previous_year_rate) * 10) / 10 : null;
            return (
              <li key={o.offence} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-700">{OFFENCE_LABELS[o.offence] ?? o.offence}<Cite cite={o.cite} /></span>
                  <span className="tabular-nums font-semibold text-[#142D4E]">{num(o.rate_per_100k)}<span className="ml-1.5 font-normal text-slate-500">city {num(o.city_rate_per_100k)}</span></span>
                </div>
                <CompareBar value={o.rate_per_100k} compare={o.city_rate_per_100k} max={max}
                  title={`${hood}: ${num(o.rate_per_100k)} · Toronto: ${num(o.city_rate_per_100k)}`} />
                <p className="mt-1 text-xs text-slate-500">
                  {num(o.count)} incident{o.count === 1 ? "" : "s"}
                  {change != null && ` · rate ${change === 0 ? "same as" : `${change > 0 ? "up" : "down"} ${num(Math.abs(change))} from`} ${c.year - 1}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-5 text-xs leading-5 text-slate-500">{c.note} Neighbourhood rates describe the whole neighbourhood, not a street or building.</p>
    </DashboardPanel>
  );
}
