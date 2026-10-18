import { Cite } from "@/components/Cite";
import { InfoTip } from "@/components/InfoTip";
import type { Brief } from "@/lib/brief";
import { money, num } from "@/lib/format";

import { DashboardPanel, STATUS_COLOR, type Status, Unavailable } from "./DashboardPanel";

// 2021 Census figures for the neighbourhood against the typical (median) one of Toronto's 158. Every bar uses the
// same scale: the track runs from 0 to twice the typical value, so the typical tick always sits at the centre and a
// bar past it means "more than typical" on every row. The band around the tick is the typical range (within 15%).
// Rows are coloured by what the difference means for a renter: for most, higher is worse; for commute modes,
// higher usually means better transit, walkability or cycling; the rest are neutral and drawn in grey.
type Direction = "higher-worse" | "higher-better" | "neutral";
const ROWS: { key: string; label: string; kind: "percent" | "money"; direction: Direction; why: string }[] = [
  { key: "median_rent_monthly", label: "Median monthly shelter cost, renters", kind: "money", direction: "higher-worse",
    why: "What renter households here paid in 2021 for rent plus utilities. Higher means a tighter budget." },
  { key: "pct_tenants_30pct_on_shelter", label: "Renters spending 30%+ of income on housing", kind: "percent", direction: "higher-worse",
    why: "Share of renter households above the usual affordability line (30% of income on housing). Higher means renting here strains budgets more." },
  { key: "dwellings_major_repairs", label: "Homes needing major repairs", kind: "percent", direction: "higher-worse",
    why: "Homes whose occupants said they need major repairs, such as plumbing, wiring or structure. Higher points to older or poorly kept housing." },
  { key: "renter_households", label: "Households that rent", kind: "percent", direction: "neutral",
    why: "Share of households that rent. Neutral: a high share means more rental housing, neither better nor worse for you." },
  { key: "pct_tenants_subsidized", label: "Renters in subsidized housing", kind: "percent", direction: "neutral",
    why: "Share of renter households in subsidized (rent-geared-to-income) housing. Shown as context, not as a judgement." },
  { key: "median_household_income", label: "Median household income (2020)", kind: "money", direction: "neutral",
    why: "Median total income of all households in 2020. Neutral: higher-income areas tend to cost more, but that isn't better or worse in itself." },
  { key: "apartments_5plus_storeys", label: "Homes in buildings of 5+ storeys", kind: "percent", direction: "neutral",
    why: "Share of homes in buildings of five or more storeys: how much of the area is apartment towers. Neutral." },
  { key: "commute_transit", label: "Commute by transit", kind: "percent", direction: "higher-better",
    why: "Share of commuters who take transit. Higher usually means better transit access. The 2021 census ran during the pandemic, so every commute share is lower than usual." },
  { key: "commute_walk", label: "Commute on foot", kind: "percent", direction: "higher-better",
    why: "Share of commuters who walk. Higher usually means work and shops are within walking distance." },
  { key: "commute_bicycle", label: "Commute by bicycle", kind: "percent", direction: "higher-better",
    why: "Share of commuters who cycle. Higher usually means safer, better-connected bike routes." },
];

const TYPICAL = 0.15;
const NEUTRAL = "#94a3b8";

/** good = better than typical for a renter, fair = within 15% of typical, poor = worse. Neutral rows aren't rated. */
function status(value: number, typical: number, direction: Direction): Status | null {
  if (direction === "neutral") return null;
  const ratio = value / typical;
  if (ratio >= 1 - TYPICAL && ratio <= 1 + TYPICAL) return "fair";
  return (ratio < 1) === (direction === "higher-worse") ? "good" : "poor";
}

const VERDICT: Record<Status, string> = { good: "better than typical", fair: "about typical", poor: "worse than typical" };

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
              const s = shown != null && typical ? status(shown, typical, r.direction) : null;
              const times = shown != null && typical ? shown / typical : null;
              return (
                <li key={r.key} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span>{r.label}<Cite cite={v.cite} /></span>
                      <InfoTip label={`About ${r.label.toLowerCase()}`}>{r.why}</InfoTip>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="text-base font-semibold text-[#142D4E]">{fmt(shown)}</span>
                      <span className="ml-1.5 text-xs text-slate-500">
                        typical {fmt(typical)}{times != null && times >= 2 ? ` (${num(Math.round(times * 10) / 10)}×)` : ""}
                      </span>
                    </span>
                  </div>
                  <CenteredBar value={shown ?? null} typical={typical} status={s}
                    label={`${hood}: ${fmt(shown)}; typical neighbourhood: ${fmt(typical)}${s ? `; ${VERDICT[s]} for a renter` : ""}`} />
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

/** One track, one height: the fill, the typical band and the typical tick are all clipped to the same rounded bar.
 *  The track spans 0 to twice typical, so a value past that simply fills it (the figure above gives the multiple). */
function CenteredBar({ value, typical, status, label }: { value: number | null; typical: number | null; status: Status | null; label: string }) {
  const max = typical ? typical * 2 : null;
  const width = value != null && max ? Math.min(100, (100 * value) / max) : 0;
  return (
    <div role="img" aria-label={label} className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
      {value != null && max != null && (
        <div className="absolute inset-y-0 left-0" style={{ width: `${width}%`, background: status ? STATUS_COLOR[status] : NEUTRAL }} />
      )}
      {max != null && <>
        <div className="absolute inset-y-0 bg-[#142D4E]/10" style={{ left: `${50 * (1 - TYPICAL)}%`, right: `${50 * (1 - TYPICAL)}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#142D4E]" />
      </>}
    </div>
  );
}

function Legend() {
  const swatch = (background: string) => <span aria-hidden className="inline-block h-2.5 w-5 rounded-full" style={{ background }} />;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600" aria-label="How to read the bars">
      <li className="flex items-center gap-1.5">{swatch(STATUS_COLOR.good)}Better than typical for a renter</li>
      <li className="flex items-center gap-1.5">{swatch(STATUS_COLOR.fair)}About typical (within 15%)</li>
      <li className="flex items-center gap-1.5">{swatch(STATUS_COLOR.poor)}Worse than typical</li>
      <li className="flex items-center gap-1.5">{swatch(NEUTRAL)}Neutral, for context</li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="relative inline-block h-2.5 w-5 overflow-hidden rounded-full bg-slate-100">
          <span className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 bg-[#142D4E]/10" />
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[#142D4E]" />
        </span>
        Typical Toronto neighbourhood (mid-bar)
      </li>
    </ul>
  );
}
