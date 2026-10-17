import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { money, num } from "@/lib/format";

import { CompareBar, DashboardPanel, StatusLegend, StatusTag, Unavailable, rate } from "./DashboardPanel";

// Takes the place of feature/frontend's RentBenchmarksPanel (CMHC rents aren't on main): rents and
// housing from the 2021 Census, compared with the median of Toronto's 158 neighbourhoods.
// `rated` rows are coloured: higher is worse for a renter (cost, housing burden, repairs). The rest
// stay neutral, because higher isn't clearly better or worse (share of renters, high-rises, income...).
const ROWS: { key: string; label: string; kind: "percent" | "money"; rated?: boolean }[] = [
  { key: "median_rent_monthly", label: "Median monthly shelter cost, renters", kind: "money", rated: true },
  { key: "renter_households", label: "Households that rent", kind: "percent" },
  { key: "pct_tenants_30pct_on_shelter", label: "Renters spending 30%+ of income on housing", kind: "percent", rated: true },
  { key: "pct_tenants_subsidized", label: "Renters in subsidized housing", kind: "percent" },
  { key: "median_household_income", label: "Median household income (2020)", kind: "money" },
  { key: "apartments_5plus_storeys", label: "Homes in buildings of 5+ storeys", kind: "percent" },
  { key: "dwellings_major_repairs", label: "Homes needing major repairs", kind: "percent", rated: true },
  { key: "commute_transit", label: "Commute by transit", kind: "percent" },
  { key: "commute_walk", label: "Commute on foot", kind: "percent" },
  { key: "commute_bicycle", label: "Commute by bicycle", kind: "percent" },
];

export default function NeighbourhoodPanel({ brief }: { brief: Brief }) {
  const values = brief.census.values ?? {};
  const hood = brief.area.neighbourhood?.name ?? "This neighbourhood";
  const pop = values.population;
  const rows = ROWS.filter((r) => values[r.key]);
  return (
    <DashboardPanel id="neighbourhood" title={`${hood} at a glance`}
      subtitle={<>2021 Census{pop?.value ? <> · population {num(pop.value)}<Cite cite={pop.cite} /></> : null}. Bar: {hood}; tick: median of Toronto&apos;s 158 neighbourhoods.</>}>
      {rows.length === 0 ? <Unavailable>Census figures are unavailable for this neighbourhood.</Unavailable> : (
        <>
        <div className="mb-4"><StatusLegend good="More than 10% below the median" fair="Within 10%" poor="More than 10% above" /></div>
        <ul className="space-y-4">
          {rows.map((r) => {
            const v = values[r.key];
            const shown = r.kind === "percent" ? v.percent ?? v.value : v.value;
            const median = v.toronto_neighbourhood_median;
            const fmt = (n: number | null | undefined) => n == null ? "—" : r.kind === "money" ? money(n) : `${num(Math.round(n * 10) / 10)}%`;
            const max = r.kind === "percent" ? 100 : Math.max(shown ?? 0, median ?? 0) * 1.25;
            const status = r.rated ? rate(shown, median, { direction: "higher-worse", tolerance: 0.1 }) : null;
            const label = status === "good" ? "Well below the median" : status === "fair" ? "Near the median" : "Well above the median";
            return (
              <li key={r.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-700">{r.label}<Cite cite={v.cite} /></span>
                  <span className="shrink-0 tabular-nums font-semibold text-[#142D4E]">{fmt(shown)}<span className="ml-1.5 font-normal text-slate-500">median {fmt(median)}</span></span>
                </div>
                <CompareBar value={shown ?? null} compare={median} max={max} status={status} title={`${hood}: ${fmt(shown)} · median: ${fmt(median)}`} />
                {status && <p className="mt-1"><StatusTag status={status} label={label} /></p>}
              </li>
            );
          })}
        </ul>
        </>
      )}
      <p className="mt-5 text-xs leading-5 text-slate-500">{brief.census.source_note} Only cost, housing burden and repairs are colour-rated; grey bars are shown for context. Shelter cost is rent plus utilities as the census defines it, from 2021; it is not a current asking rent.</p>
    </DashboardPanel>
  );
}
