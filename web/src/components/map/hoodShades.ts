import type { FeatureCollection } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";

import { money, num } from "@/lib/format";

// Neighbourhood shading options for the map, read from public/hoods-toronto.json (built by
// scripts/build-hoods.mjs). Each ramp runs from light to deep, and deep always means the reading a
// renter would worry about more, except transit, where deep simply means more transit commuting.

export type ShadeMetric = "rent" | "burden" | "assault" | "bne" | "rentsafe" | "transit";
export type Shade = "none" | ShadeMetric;

export type HoodValues = Partial<Record<ShadeMetric, number | null>> & { rentsafe_n?: number };
export type HoodsFile = { domains: Partial<Record<ShadeMetric, [number, number]>>; fc: FeatureCollection };

type ShadeSpec = {
  /** The select option, after "by". */
  option: string;
  deep: string;
  /** Deep colour at the low end (a low RentSafeTO score is the worse one). */
  lowIsDeep?: boolean;
  /** Legend end labels: the formatted value, with units on the high end. */
  low: (v: number) => string;
  high: (v: number) => string;
  /** Source and year for the legend. */
  source: string;
  /** Popup line for one neighbourhood. */
  line: (h: HoodValues) => string;
};

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v.toFixed(1))}%`);
const rate = (v: number | null | undefined) => (v == null ? "—" : num(Math.round(v)));

export const SHADE_LIGHT = "#f3f0e8";

export const SHADES: Record<ShadeMetric, ShadeSpec> = {
  rent: {
    option: "renters' shelter cost (2021)", deep: "#13724f",
    low: (v) => money(v), high: (v) => `${money(v)}/mo`, source: "2021 Census",
    line: (h) => `Renters' median shelter cost ${h.rent != null ? `${money(h.rent)}/mo` : "—"} (2021 Census)`,
  },
  burden: {
    option: "renters paying 30%+ of income (2021)", deep: "#7e22ce",
    low: pct, high: (v) => `${pct(v)} of tenant households`, source: "2021 Census",
    line: (h) => `${pct(h.burden)} of tenant households spend 30% or more of income on shelter (2021 Census)`,
  },
  assault: {
    option: "assault rate (2025)", deep: "#a62e1c",
    low: rate, high: (v) => `${rate(v)} per 100k`, source: "Toronto Police, 2025",
    line: (h) => `Assault ${rate(h.assault)} per 100k (Toronto Police, 2025)`,
  },
  bne: {
    option: "break-and-enter rate (2025)", deep: "#9a3412",
    low: rate, high: (v) => `${rate(v)} per 100k`, source: "Toronto Police, 2025",
    line: (h) => `Break and enter ${rate(h.bne)} per 100k (Toronto Police, 2025)`,
  },
  rentsafe: {
    option: "median RentSafeTO score", deep: "#b45309", lowIsDeep: true,
    low: (v) => `${num(v)} / 100`, high: (v) => `${num(v)} / 100`,
    source: "RentSafeTO, latest 2023+ evaluations; under 3 buildings unshaded",
    line: (h) => (h.rentsafe != null
      ? `Median RentSafeTO score ${num(h.rentsafe)} / 100 across ${num(h.rentsafe_n ?? null)} buildings (latest 2023+ evaluations)`
      : `RentSafeTO: ${h.rentsafe_n ? `only ${h.rentsafe_n} evaluated building${h.rentsafe_n === 1 ? "" : "s"}` : "no evaluated buildings"}, too few for a median`),
  },
  transit: {
    option: "commuting by transit (2021)", deep: "#0369a1",
    low: pct, high: (v) => `${pct(v)} of commuters`, source: "2021 Census, taken during the pandemic",
    line: (h) => `${pct(h.transit)} of commuters take transit (2021 Census, during the pandemic)`,
  },
};

/** Select order: housing cost first, then safety, building condition and getting around. */
export const SHADE_ORDER: ShadeMetric[] = ["rent", "burden", "assault", "bne", "rentsafe", "transit"];

/** MapLibre fill-color expression; neighbourhoods without a value draw at the light end. */
export function shadeFill(metric: ShadeMetric, [lo, hi]: [number, number]): ExpressionSpecification {
  const { deep, lowIsDeep } = SHADES[metric];
  const [loColor, hiColor] = lowIsDeep ? [deep, SHADE_LIGHT] : [SHADE_LIGHT, deep];
  return [
    "case", ["==", ["typeof", ["get", metric]], "number"],
    ["interpolate", ["linear"], ["get", metric], lo, loColor, hi, hiColor],
    SHADE_LIGHT,
  ];
}

export function shadeGradient(metric: ShadeMetric) {
  const { deep, lowIsDeep } = SHADES[metric];
  return `linear-gradient(to right, ${lowIsDeep ? deep : SHADE_LIGHT}, ${lowIsDeep ? SHADE_LIGHT : deep})`;
}
