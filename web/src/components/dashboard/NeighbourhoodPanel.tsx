import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { money, num } from "@/lib/format";

import { DashboardPanel, STATUS_COLOR, type Status, Unavailable } from "./DashboardPanel";

// 2021 Census figures for the neighbourhood against the typical (median) one of Toronto's 158. Every bar uses the
// same scale: the track runs from 0 to twice the typical value, so the typical tick always sits at the centre and a
// bar past it means "more than typical" on every row. The shaded zone is the typical range (within 15%).
// Only rows where higher is worse for a renter are coloured; the rest are drawn hollow, as context.
const ROWS: { key: string; label: string; kind: "percent" | "money"; rated?: boolean }[] = [
  { key: "median_rent_monthly", label: "Median monthly shelter cost, renters", kind: "money", rated: true },
  { key: "pct_tenants_30pct_on_shelter", label: "Renters spending 30%+ of income on housing", kind: "percent", rated: true },
  { key: "dwellings_major_repairs", label: "Homes needing major repairs", kind: "percent", rated: true },
  { key: "renter_households", label: "Households that rent", kind: "percent" },
  { key: "pct_tenants_subsidized", label: "Renters in subsidized housing", kind: "percent" },
  { key: "median_household_income", label: "Median household income (2020)", kind: "money" },
  { key: "apartments_5plus_storeys", label: "Homes in buildings of 5+ storeys", kind: "percent" },
  { key: "commute_transit", label: "Commute by transit", kind: "percent" },
  { key: "commute_walk", label: "Commute on foot", kind: "percent" },
  { key: "commute_bicycle", label: "Commute by bicycle", kind: "percent" },
];

const TYPICAL = 0.15;
const CONTEXT = "#64748b";

function status(value: number, typical: number): Status {
  const ratio = value / typical;
  return ratio < 1 - TYPICAL ? "good" : ratio <= 1 + TYPICAL ? "fair" : "poor";
}

export default function NeighbourhoodPanel({ brief }: { brief: Brief }) {
  const values = brief.census.values ?? {};
  const hood = brief.area.neighbourhood?.name ?? "This neighbourhood";
  const pop = values.population;
  const rows = ROWS.filter((r) => values[r.key]);
  return (
    <DashboardPanel wide id="neighbourhood" title={`${hood} at a glance`}
      subtitle={<>2021 Census{pop?.value ? <> · population {num(pop.value)}<Cite cite={pop.cite} /></> : null}, against the typical Toronto neighbourhood.</>}>
      {rows.length === 0 ? <Unavailable>Census figures are unavailable for this neighbourhood.</Unavailable> : (
        <>
          <Legend />
          <ul className="mt-5 grid gap-x-12 gap-y-5 lg:grid-cols-2">
            {rows.map((r) => {
              const v = values[r.key];
              const shown = r.kind === "percent" ? v.percent ?? v.value : v.value;
              const typical = v.toronto_neighbourhood_median;
              const fmt = (n: number | null | undefined) => n == null ? "—" : r.kind === "money" ? money(n) : `${num(Math.round(n * 10) / 10)}%`;
              const s = r.rated && shown != null && typical ? status(shown, typical) : null;
              return (
                <li key={r.key} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-700">{r.label}<Cite cite={v.cite} /></span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-base font-semibold text-[#142D4E]">{fmt(shown)}</span>
                      <span className="ml-1.5 text-xs text-slate-500">typical {fmt(typical)}</span>
                    </span>
                  </div>
                  <CenteredBar value={shown ?? null} typical={typical} status={s}
                    label={`${hood}: ${fmt(shown)}; typical neighbourhood: ${fmt(typical)}${s ? `; ${s === "good" ? "lower than" : s === "fair" ? "within 15% of" : "higher than"} typical` : ""}`} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-5 text-xs leading-5 text-slate-500">{brief.census.source_note} Shelter cost is rent plus utilities as the 2021 census defines it, not a current asking rent.</p>
    </DashboardPanel>
  );
}

/** The value as a bar on a 0 to 2x-typical track, typical tick at the centre inside the shaded typical zone. */
function CenteredBar({ value, typical, status, label }: { value: number | null; typical: number | null; status: Status | null; label: string }) {
  const max = typical ? typical * 2 : null;
  const width = value != null && max ? Math.min(100, (100 * value) / max) : 0;
  const over = value != null && max != null && value > max;
  return (
    <div role="img" aria-label={label} className="relative mt-2 h-3">
      <div className="absolute inset-y-0.5 left-0 right-0 rounded-full bg-slate-100" />
      {max != null && <div className="absolute inset-y-0 bg-slate-200/80" style={{ left: `${50 * (1 - TYPICAL)}%`, right: `${50 * (1 - TYPICAL)}%` }} />}
      {value != null && max != null && (
        <div className={`absolute inset-y-0.5 left-0 rounded-full ${over ? "rounded-r-none" : ""}`}
          style={status
            ? { width: `${width}%`, background: STATUS_COLOR[status] }
            : { width: `${width}%`, border: `1.5px solid ${CONTEXT}` }} />
      )}
      {over && <span aria-hidden className="absolute -right-1 top-1/2 -translate-y-1/2 text-[10px] leading-none" style={{ color: status ? STATUS_COLOR[status] : CONTEXT }}>▶</span>}
      {max != null && <div className="absolute -top-0.5 left-1/2 h-4 w-0.5 -translate-x-1/2 rounded-full bg-[#142D4E]" />}
    </div>
  );
}

function Legend() {
  const swatch = (style: React.CSSProperties) => <span aria-hidden className="inline-block h-2.5 w-5 rounded-full" style={style} />;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="How to read the bars">
      <li className="flex items-center gap-1.5">{swatch({ background: STATUS_COLOR.good })}Lower than typical</li>
      <li className="flex items-center gap-1.5">{swatch({ background: STATUS_COLOR.fair })}Within 15% of typical</li>
      <li className="flex items-center gap-1.5">{swatch({ background: STATUS_COLOR.poor })}Higher than typical</li>
      <li className="flex items-center gap-1.5">{swatch({ border: `1.5px solid ${CONTEXT}`, background: "white" })}Context, not rated</li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="relative inline-block h-3 w-5 bg-slate-200/80"><span className="absolute left-1/2 top-0 h-3 w-0.5 -translate-x-1/2 bg-[#142D4E]" /></span>
        Typical neighbourhood (centre) and typical range
      </li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="text-[10px] text-slate-500">▶</span>More than twice typical</li>
    </ul>
  );
}
