import type { Brief, Cite, RentSafeStats } from "./brief.ts";
import type { Extras } from "./extras.ts";
import { BEDROOM_NOUN, bedroomsKey, OFFENCE_LABELS } from "./format.ts";
import { constructionNoise } from "./noise.ts";

// What to flag, computed rather than written: each candidate is a standout deviation in the records, with its
// headline stat worked out here and the numbers its figure draws. No AI is involved, so every number is the
// record's own or simple arithmetic on it.

export const MAX_FLAGS = 3;

export type Figure =
  /** The score on a 0-100 track with the city-median tick; `trend` is comparable (2023+) past scores, oldest first. */
  | { kind: "score"; score: number; median: number | null; trend: { label: string; score: number }[] }
  /** Two bars on one scale: this place (coloured as worse) and its comparison (grey). */
  | { kind: "compare"; unit: string; mine: { label: string; value: number; text: string }; other: { label: string; value: number; text: string } }
  /** Distances to major projects on a track out to the search radius; the nearest is labelled. */
  | { kind: "distance"; radius_m: number; distances: number[] }
  | { kind: "none" };

export type Flag = {
  key: string;
  headline: string;
  /** Optional second line, e.g. a change since the last evaluation. */
  detail?: string;
  /** Where "See details" goes: a tab id, or a section id on the Overview tab. */
  tab: string;
  figure: Figure;
  cites: Cite[];
};

export type FlagListing = { rent: number | null; beds: number | null };

const SERIOUS = ["HOMICIDE", "SHOOTING", "ASSAULT", "ROBBERY", "BREAKENTER", "AUTOTHEFT", "THEFTOVER"];
const pct = (n: number) => `${Math.round(n)}%`;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
const rate1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-CA");
const month = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-CA", { month: "short", year: "numeric" });

/** "2.8× Toronto's" when at least 1.5 times; otherwise "41% above Toronto's". */
export function aboveText(mine: number, ref: number, refName: string): string {
  const ratio = mine / ref;
  return ratio >= 1.5 ? `${(Math.round(ratio * 10) / 10).toLocaleString("en-CA")}× ${refName}` : `${pct((ratio - 1) * 100)} above ${refName}`;
}

/** The census rows where higher is worse for a renter, as compared on the Neighbourhood tab. */
const CENSUS_RATED: { key: string; label: string; money?: true }[] = [
  { key: "median_rent_monthly", label: "Renters' median shelter cost", money: true },
  { key: "pct_tenants_30pct_on_shelter", label: "renters spend 30%+ of income on housing" },
  { key: "dwellings_major_repairs", label: "homes need major repairs" },
];

/** At most MAX_FLAGS flags, worst first; an empty list means nothing in the records stands out. */
export function computeFlags(brief: Brief, extras: Extras | null, stats: RentSafeStats | null, listing: FlagListing): Flag[] {
  const out: { priority: number; flag: Flag }[] = [];
  const add = (priority: number, flag: Flag) => out.push({ priority, flag });
  const b = brief.building;

  // Inspection score below the city median (2023+ scoring, the only one the median describes).
  if (b.in_rentsafe) {
    const e = b.latest_evaluation;
    const lower = e.percent_of_buildings_scoring_lower;
    const median = e.item_scale_max === 3 ? stats?.median_score ?? null : null;
    if (e.score != null && lower != null && lower < 50) {
      const comparable = b.history
        .filter((h): h is { date: string; score: number; cite: Cite } => h.date != null && h.score != null && h.date >= "2023-01-01")
        .sort((x, y) => x.date.localeCompare(y.date));
      const prev = comparable.length >= 2 ? comparable[comparable.length - 2] : null;
      const drop = prev && prev.score - e.score >= 5 ? prev.score - e.score : 0;
      add(lower < 10 ? 10 : 20, {
        key: "score",
        headline: `Inspection score ${e.score}/100, in the bottom ${Math.max(1, Math.round(lower))}% of Toronto buildings`,
        detail: drop && prev ? `Down ${drop} points since ${month(prev.date)} (${prev.score} → ${e.score})` : undefined,
        tab: "inspection",
        figure: { kind: "score", score: e.score, median, trend: comparable.map((h) => ({ label: month(h.date), score: h.score })) },
        cites: [e.cite, ...(drop && prev ? [prev.cite] : [])],
      });
    }
  }

  // Asking rent clearly above the vacant-unit average (the closest public figure to a new lease).
  const rb = extras?.rent_benchmark;
  if (rb && listing.rent != null && listing.beds != null) {
    const key = bedroomsKey(listing.beds);
    const avg = rb.by_bedrooms[key]?.vacant_units;
    if (avg != null && listing.rent > avg) {
      const gap = (listing.rent - avg) / avg * 100;
      if (gap >= 5) {
        add(gap >= 15 ? 12 : 18, {
          key: "rent",
          headline: `Asking ${money(listing.rent)}, ${pct(gap)} above the area average for a ${BEDROOM_NOUN[key]}`,
          tab: "rent",
          figure: {
            kind: "compare", unit: `per month · CMHC vacant-unit average, ${rb.survey_year}`,
            mine: { label: "This listing", value: listing.rent, text: money(listing.rent) },
            other: { label: "Area average", value: avg, text: money(avg) },
          },
          cites: [rb.cite],
        });
      }
    }
  }

  // Construction & noise: flagged whenever the score (lib/noise.ts) reaches High, a fixed cutoff.
  const noise = constructionNoise(brief);
  if (noise.level === "High" && noise.nearest) {
    const n = noise.nearest;
    const complaints = noise.noise_complaints_within_250;
    add(14, {
      key: "construction",
      headline: `Major construction ${Math.round(n.distance_m)} m away${noise.major_within_250 > 1 ? ` · ${noise.major_within_250} major projects within 250 m` : ""}`,
      detail: `Nearest: ${n.type.toLowerCase()}${n.address ? ` at ${titleCase(n.address)}` : ""}${complaints ? ` · ${complaints} noise complaint${complaints === 1 ? "" : "s"} within 250 m` : ""}`,
      tab: "construction",
      figure: {
        kind: "distance", radius_m: brief.address.radius_m,
        distances: brief.construction_nearby.notable.map((p) => p.distance_m).sort((x, y) => x - y),
      },
      cites: [noise.cites.major, noise.cites.complaints].filter((c): c is Cite => c != null),
    });
  }

  // The serious offence furthest above Toronto's rate, when at least 25% above it.
  const hood = brief.area.neighbourhood?.name;
  const worst = brief.crime.offences
    .filter((o) => SERIOUS.includes(o.offence) && o.city_rate_per_100k && o.rate_per_100k >= o.city_rate_per_100k * 1.25)
    .sort((x, y) => y.rate_per_100k / y.city_rate_per_100k! - x.rate_per_100k / x.city_rate_per_100k!)[0];
  if (worst && hood) {
    const name = OFFENCE_LABELS[worst.offence] ?? worst.offence;
    const ratio = worst.rate_per_100k / worst.city_rate_per_100k!;
    add(ratio >= 2 ? 22 : 32, {
      key: "crime",
      headline: `${name} rate ${aboveText(worst.rate_per_100k, worst.city_rate_per_100k!, "Toronto's")}`,
      tab: "crime",
      figure: {
        kind: "compare", unit: `per 100,000 people · ${brief.crime.year}`,
        mine: { label: hood, value: worst.rate_per_100k, text: rate1(worst.rate_per_100k) },
        other: { label: "Toronto", value: worst.city_rate_per_100k!, text: rate1(worst.city_rate_per_100k!) },
      },
      cites: [worst.cite],
    });
  }

  // The rated census row furthest above the typical neighbourhood, when outside the 15% "typical" zone.
  const values = brief.census.values ?? {};
  const census = CENSUS_RATED.map((r) => {
    const v = values[r.key];
    const mine = v ? (r.money ? v.value : v.percent ?? v.value) : null;
    const med = v?.toronto_neighbourhood_median ?? null;
    return v && mine != null && med ? { r, v, mine, med, ratio: mine / med } : null;
  }).filter((c) => c != null && c.ratio > 1.15).sort((x, y) => y!.ratio - x!.ratio)[0];
  if (census && hood) {
    const { r, v, mine, med } = census;
    const headline = r.money
      ? `${r.label} ${money(mine)}/mo, ${pct((mine / med - 1) * 100)} above the typical neighbourhood`
      : `${pct(mine)} of ${r.label}, vs ${pct(med)} in the typical neighbourhood`;
    add(36, {
      key: `census-${r.key}`,
      headline,
      tab: "neighbourhood",
      figure: {
        kind: "compare", unit: "2021 Census · typical = median of Toronto's 158 neighbourhoods",
        mine: { label: hood, value: mine, text: r.money ? money(mine) : pct(mine) },
        other: { label: "Typical", value: med, text: r.money ? money(med) : pct(med) },
      },
      cites: [v.cite],
    });
  }

  // No way to cool off in a heat wave.
  const reg = extras?.registration;
  if (reg && /^(none|no)$/i.test(reg.air_conditioning_type?.trim() ?? "") && reg.has_cooling_room !== true) {
    add(30, {
      key: "cooling",
      headline: `No air conditioning${reg.has_cooling_room === false ? " or cooling room" : ""} on file`,
      tab: "building",
      figure: { kind: "none" },
      cites: [reg.cite],
    });
  }

  return out.sort((x, y) => x.priority - y.priority).slice(0, MAX_FLAGS).map((o) => o.flag);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
