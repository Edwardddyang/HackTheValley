// Pure logic for the What-to-flag panel (POST /api/summary): the evidence Gemini sees, the checks its answer must
// pass, and the template used without it. Every evidence item has a short id ("f3") that maps to the Cite of the
// row(s) it came from; the model cites ids and the server turns them back into Cite objects.
// Type-only imports, so `node --test src/lib/ai/` runs this file directly.
import type { Summary, SummaryLine } from "../ai-types";
import type { Brief, Cite } from "../brief";
import type { Extras } from "../extras";

export const TEMPLATE_MODEL = "template";
/** The panel shows at most this many flags, worst first; zero flags is a valid, honest answer. */
export const MAX_FLAGS = 3;
export const MAX_QUESTIONS = 6;
/** An asking rent this many percent or more above CMHC's vacant-unit average is a price flag (shared with the ad check). */
export const MIN_PRICE_GAP_PCT = 5;
const MAX_IDS_PER_LINE = 4;
const MAX_SENTENCE_CHARS = 350;
const MAX_QUESTION_CHARS = 250;
const SCORE_OUT_OF = 100;
const RENT_CONTROL_CUTOFF = "Nov 15, 2018";

// Evidence --------------------------------------------------------------------------------------------------------

type Fact = string | number | boolean | Fact[] | { [key: string]: Fact };
type FactInput = Fact | null | undefined | FactInput[] | { [key: string]: FactInput };
export type Facts = { [key: string]: Fact };
export type EvidenceItem = { id: string; about: string; facts: Facts };
export type Evidence = { address: string; notes: string[]; items: EvidenceItem[] };

/** What an item is about. The checks use it to keep area facts (311, crime, census) off the building. */
export type Topic =
  | "address" | "area" | "building" | "registration" | "permit_at_address" | "rent" | "construction"
  | "development" | "sr311" | "crime" | "census" | "rentsafe_nearby";

const BUILDING_TOPICS: ReadonlySet<Topic> = new Set(["building", "registration", "permit_at_address"]);

type Brief311 = Brief["service_requests_311"];
type NotablePermit = Brief["construction_nearby"]["notable"][number];
type OpenApplication = Brief["development_applications"]["open"][number];

/** Ids of the items the template writes about, plus the raw values it needs. */
export type EvidenceRefs = {
  address: string | null;
  latest: string | null;
  /** The evaluation before the latest, when both use the 2023+ scoring. */
  previous: { id: string; date: string; score: number } | null;
  registration: string | null;
  rent: string | null;
  permits: { id: string; active: boolean; type: string }[];
  construction: string | null;
  nearest_notable: { id: string; permit: NotablePermit } | null;
  dev_counts: { id: string; in_review: number; approved: number } | null;
  dev_nearest: { id: string; app: OpenApplication; label: string } | null;
  sr311_nearby: string | null;
  sr311_ward: string | null;
  crime: string | null;
  census: Record<string, string>;
  rentsafe_nearby: {
    id: string; buildings: number; median_score: number; higher: number | null; lower: number | null;
  } | null;
};

export type EvidenceSet = {
  evidence: Evidence;
  cites: ReadonlyMap<string, Cite>;
  topics: ReadonlyMap<string, Topic>;
  refs: EvidenceRefs;
};

const OFFENCE_LABELS: Record<string, string> = {
  // Same names as OFFENCE_LABELS in web/src/lib/format.ts (not imported, to keep this file runnable by node --test).
  ASSAULT: "Assault",
  AUTOTHEFT: "Auto theft",
  BIKETHEFT: "Bicycle theft",
  BREAKENTER: "Break and enter",
  HOMICIDE: "Homicide",
  ROBBERY: "Robbery",
  SHOOTING: "Shootings",
  THEFTFROMMV: "Theft from vehicle",
  THEFTOVER: "Theft over $5,000",
};

const CENSUS_FACTS: { key: string; measure: string; kind: "percent" | "value" }[] = [
  { key: "median_rent_monthly", measure: "Median monthly shelter cost of renter households ($)", kind: "value" },
  { key: "renter_households", measure: "Households that rent (%)", kind: "percent" },
  { key: "pct_tenants_30pct_on_shelter", measure: "Renter households spending 30% or more of income on shelter (%)", kind: "value" },
  { key: "median_household_income", measure: "Median household income in 2020 ($)", kind: "value" },
  { key: "commute_transit", measure: "Commuters taking public transit (%)", kind: "percent" },
  { key: "commute_walk", measure: "Commuters walking (%)", kind: "percent" },
];

const RENT_CONTROL_TEXT = {
  likely_covered: `likely covered by Ontario's rent-increase guideline (built before the ${RENT_CONTROL_CUTOFF} cut-off); confirm with the landlord`,
  likely_exempt: `likely exempt from Ontario's rent-increase guideline (units first occupied after ${RENT_CONTROL_CUTOFF} generally are); confirm with the landlord`,
  unknown: "unclear from the year built; ask the landlord when the unit was first occupied",
} as const;

/**
 * Units first occupied after Nov 15, 2018 are exempt from the guideline. Only the year built is known, so this is an
 * estimate: 2018 itself is ambiguous, and older buildings can contain newly created units.
 */
export function rentControl(yearBuilt: number | null): keyof typeof RENT_CONTROL_TEXT {
  if (yearBuilt == null) return "unknown";
  if (yearBuilt <= 2017) return "likely_covered";
  if (yearBuilt >= 2019) return "likely_exempt";
  return "unknown";
}

/** "375 BRUNSWICK AVE" -> "375 Brunswick Ave". */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

const lower = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : null);
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const isNone = (s: string | null | undefined) => s != null && /^(none|no|n\/a|nil)$/i.test(s.trim());

function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function compact(v: FactInput): Fact | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v)) {
    const out = v.map(compact).filter((x): x is Fact => x !== undefined);
    return out.length ? out : undefined;
  }
  if (typeof v === "object") {
    const out: Facts = {};
    for (const [k, x] of Object.entries(v)) {
      const c = compact(x);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

const byDistance = <T extends { distance_m: number }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.distance_m - b.distance_m);

/** An aggregate cite in the shape bb_cite_many() returns. */
function aggregateCite(like: Cite, rowCount: number, sampleRows: number[]): Cite {
  return { dataset: like.dataset, file: like.file, row_count: rowCount, sample_rows: sampleRows.slice(0, 5) };
}

export function buildEvidence(brief: Brief, extras: Extras | null): EvidenceSet {
  const r = brief.address.radius_m;
  const items: EvidenceItem[] = [];
  const cites = new Map<string, Cite>();
  const topics = new Map<string, Topic>();
  const refs: EvidenceRefs = {
    address: null, latest: null, previous: null, registration: null, rent: null, permits: [], construction: null,
    nearest_notable: null, dev_counts: null, dev_nearest: null, sr311_nearby: null, sr311_ward: null, crime: null,
    census: {}, rentsafe_nearby: null,
  };

  function add(topic: Topic, cite: Cite | null | undefined, about: string, facts: { [key: string]: FactInput }) {
    const compacted = compact(facts);
    if (!cite || !compacted || typeof compacted !== "object" || Array.isArray(compacted)) return null;
    const id = `f${items.length + 1}`;
    items.push({ id, about, facts: compacted });
    cites.set(id, cite);
    topics.set(id, topic);
    return id;
  }

  const notes = [
    "Facts come from City of Toronto open data, the Toronto Police Service and CMHC. A missing fact means the record doesn't say; don't guess it.",
    "RentSafeTO evaluates only apartment buildings with 3+ storeys and 10+ units. Scores are out of 100. Since 2023 each item is graded 1 (worst) to 3 (best); evaluations before 2023 used a different scoring and are not directly comparable.",
    "311 requests are located only to a street intersection or a postal area, never to a building, and the data has no closing dates.",
    `Rent control is an estimate from the year built: units first occupied after ${RENT_CONTROL_CUTOFF} are generally exempt from Ontario's rent-increase guideline.`,
    "CMHC averages for all units include long-time tenants; rents of vacant units are the closest public figure to a new lease.",
    "Crime rates and census figures describe the whole neighbourhood, not this building.",
  ];

  // Address and area.
  const { address, area } = brief;
  refs.address = add("address", address.cite, "The address looked up", {
    address: address.address, municipality: address.municipality, search_radius_m: r,
  });
  const hood = area.neighbourhood?.name ?? null;
  add("area", area.neighbourhood?.cite, "Neighbourhood the address is in", { neighbourhood: hood });
  add("area", area.ward?.cite, "City ward the address is in", {
    ward_number: area.ward?.ward_number, ward_name: area.ward?.name,
  });

  // The building.
  const b = brief.building;
  if (b.in_rentsafe) {
    const e = b.latest_evaluation;
    const lowest = e.lowest_items ?? [];
    refs.latest = add("building", e.cite, "Latest RentSafeTO evaluation of this building", {
      building_address: titleCase(b.site_address),
      year_built: b.year_built,
      storeys: b.storeys,
      units: b.units,
      property_type: lower(b.property_type),
      rent_control: RENT_CONTROL_TEXT[rentControl(b.year_built)],
      evaluated_on: e.date,
      score: e.score,
      score_out_of: SCORE_OUT_OF,
      percent_of_toronto_buildings_scoring_lower: e.percent_of_buildings_scoring_lower,
      item_grades: `1 (worst) to ${e.item_scale_max} (best)`,
      lowest_graded_items: lowest.map((i) => `${sentenceCase(i.item)}: ${i.score} of ${e.item_scale_max}`),
    });
    if (e.percent_of_buildings_scoring_lower != null) {
      notes.push("percent_of_toronto_buildings_scoring_lower compares with the latest evaluation of every RentSafeTO building in Toronto (2023+ scoring).");
    }
    if (lowest.length) notes.push(`lowest_graded_items lists at most ${lowest.length} items; other items may have the same grade.`);

    const latestIs2023 = e.date != null && e.date >= "2023-01-01";
    const earlier = b.history.filter((h) => h.date !== e.date).slice(0, 4);
    earlier.forEach((h, i) => {
      const comparable = h.date != null && h.date >= "2023-01-01";
      const id = add("building", h.cite,
        comparable ? "Earlier RentSafeTO evaluation of this building"
          : "Earlier RentSafeTO evaluation of this building (pre-2023 scoring, not directly comparable)",
        { evaluated_on: h.date, score: h.score });
      if (i === 0 && id && comparable && latestIs2023 && h.date && h.score != null) {
        refs.previous = { id, date: h.date, score: h.score };
      }
    });
  } else {
    notes.push(b.note);
  }

  const reg = extras?.registration;
  if (reg) {
    refs.registration = add("registration", reg.cite, "City apartment building registration for this building", {
      heating_type: lower(reg.heating_type),
      heating_equipment_status: lower(reg.heating_equipment_status),
      heating_equipment_year: reg.heating_equipment_year,
      air_conditioning: lower(reg.air_conditioning_type),
      has_cooling_room: reg.has_cooling_room,
      pets_allowed: lower(reg.pets_allowed),
      property_manager: reg.property_manager,
      elevators: reg.elevators,
      laundry_room: lower(reg.laundry_room),
    });
  }

  const rb = extras?.rent_benchmark;
  if (rb) {
    const rents = (kind: "vacant_units" | "all_units") => ({
      studio: rb.by_bedrooms.studio?.[kind],
      one_bedroom: rb.by_bedrooms.one?.[kind],
      two_bedroom: rb.by_bedrooms.two?.[kind],
      three_plus_bedroom: rb.by_bedrooms.three_plus?.[kind],
    });
    refs.rent = add("rent", rb.cite,
      `Average monthly rents of purpose-built rental apartments in ${rb.area} (${rb.survey}); describes the area, not this building`,
      { area: rb.area, survey: rb.survey, vacant_units: rents("vacant_units"), all_units: rents("all_units"), note: rb.note });
  }

  for (const p of brief.permits_at_address.items.slice(0, 3)) {
    const id = add("permit_at_address", p.cite, `Building permit at this address (${p.group})`, {
      permit_type: p.type, work: p.work, status: p.status, application_date: p.application_date,
      issued_date: p.issued_date, completed_date: p.completed_date, description: truncate(p.description, 200),
      estimated_cost: p.est_const_cost,
    });
    if (id) refs.permits.push({ id, active: p.group === "active", type: p.type });
  }

  // Construction and development nearby.
  const c = brief.construction_nearby;
  refs.construction = add("construction", c.cite, `Active building permits within ${r} m of the address`, {
    radius_m: r,
    active_permits: c.active_permit_count,
    most_common_types: c.by_type.slice(0, 3).map((t) => `${t.type}: ${t.count}`),
  });
  const nearestNotable = byDistance(c.notable);
  const largest = [...c.notable].sort((x, y) => (y.est_const_cost ?? 0) - (x.est_const_cost ?? 0))[0];
  const picks = [...new Set([nearestNotable[0], nearestNotable[1], largest])].filter((p): p is NotablePermit => p != null);
  for (const p of picks) {
    const id = add("construction", p.cite, `Major building permit within ${r} m (${c.notable_definition})`, {
      address: p.address ? titleCase(p.address) : null,
      permit_type: p.type,
      status: p.status,
      distance_m: Math.round(p.distance_m),
      issued_date: p.issued_date,
      description: truncate(p.description, 220),
      estimated_cost: p.est_const_cost,
      new_dwelling_units: p.dwelling_units_created,
    });
    if (id && p === nearestNotable[0]) refs.nearest_notable = { id, permit: p };
  }

  const d = brief.development_applications;
  const inReview = d.counts?.in_review ?? 0;
  const approved = d.counts?.approved ?? 0;
  if (inReview + approved > 0 && d.open.length) {
    const rows = d.open.flatMap((a) => ("row" in a.cite ? [a.cite.row] : []));
    const id = add("development", aggregateCite(d.open[0].cite, inReview + approved, rows),
      `Open development applications within ${r} m (planning applications such as rezoning, site plans and condominiums; a project often has several)`,
      { radius_m: r, in_review: inReview, approved });
    if (id) refs.dev_counts = { id, in_review: inReview, approved };
  }
  const recent = d.open.length >= 20 ? ` (one of the 20 most recently submitted)` : "";
  for (const a of byDistance(d.open).slice(0, 3)) {
    const label = d.type_labels[a.type] ?? a.type;
    const id = add("development", a.cite, `Open development application within ${r} m${recent}`, {
      address: a.address ? titleCase(a.address) : null,
      also_covers: a.other_addresses?.slice(0, 3).map(titleCase),
      application_type: label,
      status: a.status,
      distance_m: Math.round(a.distance_m),
      date_submitted: a.date_submitted,
      community_meeting_date: a.community_meeting_date,
      description: truncate(a.description, 220),
    });
    if (id && !refs.dev_nearest) refs.dev_nearest = { id, app: a, label };
  }

  // 311: area-level only.
  const s = brief.service_requests_311;
  const period = s.period.from && s.period.to ? `${s.period.from} to ${s.period.to}` : "recent months";
  const add311 = (scope: Brief311["nearby"]["top_types"], where: string) => {
    for (const t of scope.slice(0, 3)) {
      add("sr311", t.cite, `One of the most common 311 request types ${where}, ${period}`, { request_type: t.type, requests: t.count });
    }
  };
  if (s.nearby.count > 0 && s.nearby.top_types.length) {
    refs.sr311_nearby = add("sr311",
      aggregateCite(s.nearby.top_types[0].cite, s.nearby.count, s.nearby.points.map((p) => p.row)),
      `311 service requests reported at street intersections within ${r} m, ${period}. Requests reported by postal code have no location and are not counted. Describes the area, not this building`,
      { radius_m: r, period_from: s.period.from, period_to: s.period.to, requests: s.nearby.count });
    add311(s.nearby.top_types, `at intersections within ${r} m`);
  }
  if (s.ward.count > 0 && s.ward.top_types.length && s.ward.ward_number != null) {
    const first = s.ward.top_types[0].cite;
    refs.sr311_ward = add("sr311",
      aggregateCite(first, s.ward.count, "sample_rows" in first ? first.sample_rows : []),
      `311 service requests across Ward ${s.ward.ward_number} (all locations), ${period}. Describes the whole ward, not this building`,
      { ward_number: s.ward.ward_number, period_from: s.period.from, period_to: s.period.to, requests: s.ward.count });
    add311(s.ward.top_types, `across Ward ${s.ward.ward_number}`);
  }

  // Crime and census: neighbourhood-level.
  const cr = brief.crime;
  const hoodLabel = hood ? `the ${hood} neighbourhood` : "the neighbourhood";
  const byCite = new Map<string, typeof cr.offences>();
  for (const o of cr.offences) {
    const key = JSON.stringify(o.cite);
    byCite.set(key, [...(byCite.get(key) ?? []), o]);
  }
  for (const group of byCite.values()) {
    const compared = group.filter((o) => o.city_rate_per_100k != null);
    const id = add("crime", group[0].cite,
      `Toronto Police Service crime rates for ${hoodLabel} in ${cr.year}, per 100,000 people, with the rate for all of Toronto. Describes the whole neighbourhood, not this building`,
      {
        neighbourhood: hood,
        year: cr.year,
        offences: Object.fromEntries(group.map((o) => [OFFENCE_LABELS[o.offence] ?? o.offence, {
          rate_per_100k: o.rate_per_100k,
          toronto_rate_per_100k: o.city_rate_per_100k,
          incidents: o.count,
          previous_year_rate_per_100k: o.previous_year_rate,
        }])),
        offence_types_compared: compared.length,
        offence_types_above_toronto_rate: compared.filter((o) => o.rate_per_100k > (o.city_rate_per_100k ?? Infinity)).length,
      });
    refs.crime ??= id;
  }

  const values = brief.census.values ?? {};
  for (const f of CENSUS_FACTS) {
    const v = values[f.key];
    if (!v) continue;
    const id = add("census", v.cite,
      `2021 Census for ${hoodLabel}, with the median of Toronto's 158 neighbourhoods. Describes the whole neighbourhood, not this building`,
      {
        measure: f.measure,
        value: f.kind === "percent" ? v.percent ?? v.value : v.value,
        toronto_neighbourhood_median: v.toronto_neighbourhood_median,
      });
    if (id) refs.census[f.key] = id;
  }

  // Other evaluated buildings nearby (2023+ scoring only, so the scores compare).
  const thisRsn = b.in_rentsafe ? b.rsn : null;
  const own = brief.rentsafe_nearby.buildings.find((x) => x.rsn === thisRsn);
  const others = byDistance(brief.rentsafe_nearby.buildings).filter(
    (x) => x.rsn !== thisRsn && x.scoring === "2023+" && x.score != null && "row" in x.cite);
  const sameFile = others.filter((x) => x.cite.file === others[0]?.cite.file);
  if (sameFile.length) {
    const scores = sameFile.map((x) => x.score as number);
    const myScore = b.in_rentsafe && own?.scoring === "2023+" ? b.latest_evaluation.score : null;
    const higher = myScore != null ? scores.filter((x) => x > myScore).length : null;
    const lowerCount = myScore != null ? scores.filter((x) => x < myScore).length : null;
    const med = median(scores);
    const id = add("rentsafe_nearby",
      aggregateCite(sameFile[0].cite, sameFile.length, sameFile.map((x) => ("row" in x.cite ? x.cite.row : 0))),
      `Other RentSafeTO-evaluated apartment buildings within ${r} m (latest evaluation of each, 2023+ scoring, out of 100)`,
      {
        radius_m: r,
        buildings: sameFile.length,
        median_score: med,
        highest_score: Math.max(...scores),
        lowest_score: Math.min(...scores),
        scoring_higher_than_this_building: higher,
        scoring_lower_than_this_building: lowerCount,
      });
    if (id) refs.rentsafe_nearby = { id, buildings: sameFile.length, median_score: med, higher, lower: lowerCount };
  }

  return { evidence: { address: address.address, notes, items }, cites, topics, refs };
}

// Numeric grounding ---------------------------------------------------------------------------------------------

// Digits not glued to a preceding letter or digit (so "M5R" and "f12" yield nothing), with 1,234 grouping and decimals.
const NUMBER_RE = /(?<![A-Za-z0-9])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g;

/** Numbers written in `text`: "1,200" and "1200" -> 1200, "18.0" -> 18, "2025-10-02" -> 2025, 10, 2. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER_RE)) out.push(Number(m[1].replace(/,/g, "") + (m[2] ?? "")));
  return out;
}

function collect(value: unknown, numbers: number[], strings: string[]): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) numbers.push(Math.abs(value));
  } else if (typeof value === "string") {
    strings.push(value);
    numbers.push(...extractNumbers(value));
  } else if (Array.isArray(value)) {
    for (const v of value) collect(v, numbers, strings);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      // Keys carry facts too ("Theft over $5,000" is an offence name).
      strings.push(k.replace(/_/g, " "));
      numbers.push(...extractNumbers(k));
      collect(v, numbers, strings);
    }
  }
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const round1 = (n: number) => Math.round(n * 10) / 10;

// Spelled-out numbers ("forty complaints") are grounded like digits. "one" and "no" are left out on purpose: they are
// ordinary words ("one of the", "no air conditioning") far more often than quantities.
const WORD_NUMBERS: Readonly<Record<string, number>> = {
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000, dozen: 12,
};
const NUMBER_WORD_RE = new RegExp(String.raw`\b(?:${Object.keys(WORD_NUMBERS).join("|")})\b`, "gi");

/** True when `n` is in `allowed`, exactly, rounded or truncated (88.1 -> 88 but not 89; 193.5 -> 193 or 194). */
export function isNumberGrounded(n: number, allowed: readonly number[]): boolean {
  return allowed.some((e) => same(e, n) || same(round1(e), n) || same(Math.round(e), n) || same(Math.floor(e), n));
}

export type GroundingContext = {
  cites: ReadonlyMap<string, Cite>;
  topics: ReadonlyMap<string, Topic>;
  /** Numbers any line may use: the notes, the address and the radius. */
  shared_numbers: readonly number[];
  /** Per item id: its numbers, and its lower-cased text for checking claimed conditions. */
  item_numbers: ReadonlyMap<string, readonly number[]>;
  item_text: ReadonlyMap<string, string>;
};

export function groundingContext(set: EvidenceSet): GroundingContext {
  const shared: number[] = [];
  collect([set.evidence.notes, set.evidence.address], shared, []);
  const radius = set.evidence.items.find((i) => i.id === set.refs.address)?.facts.search_radius_m;
  if (typeof radius === "number") shared.push(radius);
  const itemNumbers = new Map<string, number[]>();
  const itemText = new Map<string, string>();
  for (const item of set.evidence.items) {
    const numbers: number[] = [];
    const strings: string[] = [item.about];
    collect(item.about, numbers, []);
    collect(item.facts, numbers, strings);
    itemNumbers.set(item.id, [...new Set(numbers)]);
    itemText.set(item.id, strings.join("\n").toLowerCase());
  }
  return {
    cites: set.cites, topics: set.topics, shared_numbers: [...new Set(shared)], item_numbers: itemNumbers, item_text: itemText,
  };
}

// Output checks -------------------------------------------------------------------------------------------------

// Conditions a line may only claim when an item it cites mentions them (an evaluation item, a permit, ...).
const CONDITION_TERMS: { label: string; re: RegExp }[] = [
  { label: "pests", re: /\bpests?\b/i },
  { label: "cockroaches", re: /\b(?:cock)?roach(?:es)?\b/i },
  { label: "bed bugs", re: /\bbed ?bugs?\b/i },
  { label: "rodents", re: /\b(?:mice|mouse|rats?|rodents?|vermin)\b/i },
  { label: "infestation", re: /\binfest(?:ed|ation|ations)?\b/i },
  { label: "mould", re: /\bmou?ldy?\b/i },
  { label: "asbestos", re: /\basbestos\b/i },
  { label: "leaks or flooding", re: /\b(?:leak(?:s|ing|y)?|flood(?:s|ing|ed)?)\b/i },
  { label: "fire", re: /\bfires?\b/i },
];
const CRIME_RE =
  /\b(?:crimes?|criminal|assaults?|robber(?:y|ies)|thefts?|break(?:-| and )(?:ins?|enters?)|burglar(?:y|ies)|homicides?|shootings?|stolen|violen(?:t|ce))\b/i;
// "at this building" and friends, unless negated ("not at this building", "rather than the building").
const AT_BUILDING_RE =
  /(?<!\b(?:not|than|never)\s+)\b(?:at|in|inside|from|for|about|against|on|regarding)\s+(?:this|the|your)\s+(?:building|address|property|unit|apartment)\b(?!['’]s)/i;
const BUILDING_REF_RE = /\b(?:this|the|your)\s+(?:building|address|property|unit|apartment)\b(?!['’]s)/i;
// The same without the possessive exemption: "this building's assault rate" still pins area data on the building.
const BUILDING_ANY_REF_RE = /\b(?:this|the|your)\s+(?:building|address|property|unit|apartment)\b/i;
// "not this building", "rather than the address": the line keeps area data off the building on purpose.
const NEGATED_ATTRIBUTION_RE =
  /\b(?:not|never|rather than|instead of)\s+(?:at\s+|about\s+|in\s+)?(?:this|the|your)\s+(?:building|address|property|unit|apartment)/i;
const RENT_CONTROL_RE = /rent[ -]?control|rent[ -]?increase guideline/i;
const RENT_CONTROL_HEDGE_RE = /\blikely\b|\bunclear\b|confirm with the landlord|ask the landlord/i;
const SIGNING_ADVICE_RE =
  /\b(?:you\s+)?should(?:n['’]?t|\s+not)?\s+sign\b|\bdon['’]?t\s+sign\b|\bdo\s+not\s+sign\b|\bwalk\s+away\b/i;
const RESOLUTION_RE = /\b(?:resol(?:ved|ves?|ving|ution)|closed|closing|response times?|turnaround)\b/i;
const CITATION_IN_TEXT_RE = /\s*[[(]\s*(?:evidence\s*:?\s*)?f\d{1,3}(?:\s*[,;]\s*f\d{1,3})*\s*[\])]/gi;

export type CheckedLine = { text: string; ids: string[] };
export type Rejection = { text: string; reason: string };
export type CheckedSummary = { sentences: CheckedLine[]; checklist: CheckedLine[]; rejected: Rejection[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Strips inline citations, bullets and stray whitespace from a model-written line (shared with the ad check). */
export function cleanText(raw: string): string {
  return raw
    .replace(CITATION_IN_TEXT_RE, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:?!])/g, "$1")
    .trim();
}

/** The evidence ids in `raw` that exist in the context, deduplicated and capped (shared with the ad check). */
export function validIds(raw: unknown, ctx: GroundingContext): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (ctx.cites.has(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, MAX_IDS_PER_LINE);
}

/** Why a line must be dropped, or null when it passes every check. */
export function checkLine(text: string, ids: readonly string[], ctx: GroundingContext, maxChars: number): string | null {
  if (!text) return "empty";
  if (text.length > maxChars) return "too long";
  if (ids.length === 0) return "no valid citation";

  const allowed = [...ctx.shared_numbers, ...ids.flatMap((id) => ctx.item_numbers.get(id) ?? [])];
  for (const n of extractNumbers(text)) {
    if (!isNumberGrounded(n, allowed)) return `number ${n} is not in the cited evidence`;
  }
  const citedText = ids.map((id) => ctx.item_text.get(id) ?? "").join("\n");
  for (const m of text.matchAll(NUMBER_WORD_RE)) {
    const word = m[0].toLowerCase();
    if (isNumberGrounded(WORD_NUMBERS[word], allowed)) continue;
    // A cited item that spells the number out itself ("three-storey addition" in a permit description) grounds it.
    if (new RegExp(String.raw`\b${word}\b`).test(citedText)) continue;
    return `number word "${word}" is not in the cited evidence`;
  }

  const topics = ids.map((id) => ctx.topics.get(id));
  const about311 = topics.includes("sr311") || /\b311\b/.test(text);
  if (about311 && AT_BUILDING_RE.test(text)) return "attributes area 311 requests to the building";
  // "This building has 328 311 requests" needs no preposition to pin area requests on the building.
  if (about311 && BUILDING_REF_RE.test(text) && !NEGATED_ATTRIBUTION_RE.test(text)) {
    return "attributes area 311 requests to the building";
  }
  if (about311 && RESOLUTION_RE.test(text)) return "mentions 311 resolution, which the data doesn't have";

  if (CRIME_RE.test(text)) {
    if (!topics.includes("crime")) return "claims crime without a crime record";
    if (BUILDING_ANY_REF_RE.test(text)) return "attributes neighbourhood crime to the building";
  }
  if (topics.includes("census") && BUILDING_ANY_REF_RE.test(text)) {
    return "attributes neighbourhood census data to the building";
  }

  for (const term of CONDITION_TERMS) {
    if (!term.re.test(text)) continue;
    const support = ids.filter((id) => term.re.test(ctx.item_text.get(id) ?? ""));
    if (support.length === 0) return `claims ${term.label} without a record`;
    const onBuilding = support.some((id) => BUILDING_TOPICS.has(ctx.topics.get(id) as Topic));
    // Keeps the possessive exemption: "the building's City registration" is a legitimate building record.
    if (!onBuilding && BUILDING_REF_RE.test(text)) return `attributes ${term.label} to the building without a building record`;
  }

  // Rent control is an estimate from the year built; questions may ask about it, statements must hedge.
  if (!text.includes("?") && RENT_CONTROL_RE.test(text) && !RENT_CONTROL_HEDGE_RE.test(text)) {
    return "states rent control as certain";
  }
  if (SIGNING_ADVICE_RE.test(text)) return "gives advice on signing";
  return null;
}

/**
 * Checks Gemini's JSON against the evidence: drops ids that aren't in it, then lines left without a citation, lines
 * with numbers the cited items don't contain, and lines that break the data rules.
 */
export function validateSummaryOutput(raw: unknown, ctx: GroundingContext): CheckedSummary {
  const rejected: Rejection[] = [];
  const obj = isRecord(raw) ? raw : {};

  function take(list: unknown, textKey: string, maxChars: number, max: number): CheckedLine[] {
    const out: CheckedLine[] = [];
    const seen = new Set<string>();
    for (const entry of Array.isArray(list) ? list : []) {
      if (!isRecord(entry)) continue;
      const rawText = entry[textKey] ?? entry.text ?? entry.question;
      const text = typeof rawText === "string" ? cleanText(rawText) : "";
      const ids = validIds(entry.evidence_ids ?? entry.ids ?? entry.sources, ctx);
      const reason = checkLine(text, ids, ctx, maxChars);
      if (reason) {
        rejected.push({ text, reason });
        continue;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (out.length < max) out.push({ text, ids });
    }
    return out;
  }

  return {
    sentences: take(obj.flags ?? obj.sentences, "text", MAX_SENTENCE_CHARS, MAX_FLAGS),
    checklist: take(obj.checklist, "question", MAX_QUESTION_CHARS, MAX_QUESTIONS),
    rejected,
  };
}

/** Evidence ids -> the Cite objects they stand for, without duplicates. */
export function citesFor(ids: readonly string[], cites: ReadonlyMap<string, Cite>): Cite[] {
  const out: Cite[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const cite = cites.get(id);
    if (!cite) continue;
    const key = JSON.stringify(cite);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cite);
  }
  return out;
}

export function toSummary(
  lines: { sentences: CheckedLine[]; checklist: CheckedLine[] },
  cites: ReadonlyMap<string, Cite>,
  model: string,
  now: Date = new Date(),
): Summary {
  const toLine = (l: CheckedLine): SummaryLine => ({ text: l.text, cites: citesFor(l.ids, cites) });
  return {
    sentences: lines.sentences.map(toLine),
    checklist: lines.checklist.map(toLine),
    model,
    generated_at: now.toISOString(),
  };
}

// Prompt and response schema ------------------------------------------------------------------------------------

export function summarySystemInstruction(radiusM: number): string {
  return `You pick what to flag about one Toronto address for the "What to flag" panel at the top of RentReceipts, a tool for renters checking a building before they sign.
You receive EVIDENCE as JSON: "items", each with an "id" (like "f3"), what it is "about", and "facts" from City of Toronto open data, the Toronto Police Service and CMHC, plus "notes" that explain the data. You may also receive LISTING: the asking rent and bedrooms the renter gave, with the difference from the cited CMHC average already computed.

Write two things:
1. "flags": 0 to 3 short bullets (under 25 words each) naming the standout deviations in the records, the most serious first. A flag is something a renter would want explained before signing: a low or falling RentSafeTO score and its worst-graded items, no cooling on file, an asking rent above the CMHC vacant-unit average, major construction or a development application close by, offence rates well above Toronto's. Rank, don't summarize: leave out everything ordinary for Toronto, and return an empty list when nothing stands out - never pad to 3.
2. "checklist": 3 to 6 questions the renter can ask the landlord at the viewing, grounded in the lowest-graded items and the other facts.

Rules:
- Use only the facts in EVIDENCE and LISTING. No outside knowledge, guesses or assumptions.
- Every flag and question lists in "evidence_ids" the id of each item it relies on, copied exactly. At least one.
- Copy numbers exactly as they appear in the facts of the items you cite or in LISTING. Don't calculate, convert or invent numbers.
- 311 requests are located only to an intersection or a postal area, never to a building, and the data has no closing dates: say "within ${radiusM} m" or "in Ward N", never "at this building", and never say how quickly requests were resolved.
- Crime rates and census figures describe the whole neighbourhood: name the neighbourhood, and never present them as facts about this building.
- Never say the building has pests, mould, leaks, bed bugs or any other condition unless an item about this building says so. Describe evaluation results as the item name and its grade (1 = worst, 3 = best).
- Rent control is only "likely": say the building is likely covered or likely exempt, and that the renter should confirm with the landlord.
- For rents, CMHC's "vacant_units" figures are the closest to a new lease; "all_units" averages include long-time tenants.
- Neutral, factual tone. No legal advice, no telling the renter whether to sign, no exaggeration.
- Leave out facts that are missing; don't write about what the data lacks.`;
}

/**
 * The listing's rent against the CMHC average, as the server computed it (shape-compatible with ad-check-core's
 * RentComparison, defined here structurally so the pure modules stay one-directional).
 */
export type ListingContext = {
  rent: number; kind: "vacant_units" | "all_units"; noun: string; average: number; diff: number; pct: number;
} | null;

export function summaryUserPrompt(evidence: Evidence, listing: ListingContext = null): string {
  const listingPart = listing
    ? `\n\nLISTING (what the renter told us, with the difference from the cited CMHC average already computed):\n${JSON.stringify({
        asking_rent: listing.rent, bedroom_type: listing.noun, average_kind: listing.kind,
        average_monthly_rent: listing.average, asks_minus_average: listing.diff, percent_difference: listing.pct,
      })}`
    : "";
  return `EVIDENCE:\n${JSON.stringify(evidence)}${listingPart}`;
}

/** JSON schema for Gemini's structured output; the enum limits citations to the evidence ids. */
export function summaryResponseSchema(ids: readonly string[]) {
  const evidenceIds = {
    type: "array",
    items: { type: "string", enum: [...new Set(ids)] },
    minItems: 1,
    maxItems: MAX_IDS_PER_LINE,
  };
  return {
    type: "object",
    properties: {
      flags: {
        type: "array",
        minItems: 0,
        maxItems: MAX_FLAGS,
        items: {
          type: "object",
          properties: { text: { type: "string" }, evidence_ids: evidenceIds },
          required: ["text", "evidence_ids"],
        },
      },
      checklist: {
        type: "array",
        minItems: 1,
        maxItems: MAX_QUESTIONS,
        items: {
          type: "object",
          properties: { question: { type: "string" }, evidence_ids: evidenceIds },
          required: ["question", "evidence_ids"],
        },
      },
    },
    required: ["flags", "checklist"],
  };
}

// Template: the flags without AI. Used when Gemini is missing, fails or its answer doesn't survive the checks. ----

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number) => `$${new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 }).format(n)}`;

/** "2025-10-02" -> "Oct 2, 2025" (the format of web/src/lib/format.ts, without depending on the ICU version). */
export function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso;
}

/** "2023-10-04" -> "Oct 2023". */
export function monthLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/**
 * The template's flags and checklist, still as evidence ids (so tests can run them through the same checks as
 * Gemini's). Flags are deterministic worry-first candidates cut at MAX_FLAGS; an empty list is the honest answer
 * when nothing in the records stands out.
 */
export function templateLines(
  brief: Brief,
  extras: Extras | null,
  set: EvidenceSet = buildEvidence(brief, extras),
  listing: ListingContext = null,
) {
  const { refs } = set;
  const checklist: CheckedLine[] = [];
  const say = (list: CheckedLine[], text: string, ids: (string | null | undefined)[]) => {
    const clean = ids.filter((id): id is string => Boolean(id));
    if (clean.length) list.push({ text, ids: clean });
  };

  // Flags: each standout deviation becomes a candidate; lower priority = bigger worry, shown first.
  const candidates: { priority: number; line: CheckedLine }[] = [];
  const flag = (priority: number, text: string, ids: (string | null | undefined)[]) => {
    const clean = ids.filter((id): id is string => Boolean(id));
    if (clean.length) candidates.push({ priority, line: { text, ids: clean } });
  };

  const b = brief.building;
  const e = b.in_rentsafe ? b.latest_evaluation : null;
  const lowest = [...(e?.lowest_items ?? [])].sort((x, y) => x.score - y.score);

  const pctLower = e?.percent_of_buildings_scoring_lower ?? null;
  if (e && e.score != null && pctLower != null && pctLower < 50) {
    const prev = refs.previous;
    const drop = prev && prev.score > e.score ? `, down from ${prev.score} in ${monthLabel(prev.date)}` : "";
    flag(pctLower < 10 ? 10 : 20,
      `Scored ${e.score}/100 on its latest RentSafeTO evaluation${e.date ? ` (${dateLabel(e.date)})` : ""}${drop}; only ${pctLower}% of evaluated Toronto buildings score lower.`,
      [refs.latest, prev && prev.score > e.score ? prev.id : null]);
  }

  // The nearer of the closest open development application and the closest major permit: big change close by.
  const near = refs.dev_nearest;
  const notable = refs.nearest_notable;
  const nearDist = near ? Math.round(near.app.distance_m) : Infinity;
  const notableDist = notable ? Math.round(notable.permit.distance_m) : Infinity;
  if (near && nearDist <= notableDist && nearDist <= 300) {
    flag(nearDist <= 150 ? 15 : 25,
      `${near.label} ${near.app.status.toLowerCase()} ${nearDist} m away${near.app.address ? ` at ${titleCase(near.app.address)}` : ""}.`,
      [near.id]);
  } else if (notable && notableDist <= 300) {
    flag(notableDist <= 150 ? 15 : 25,
      `Major construction ${notableDist} m away${notable.permit.address ? ` at ${titleCase(notable.permit.address)}` : ""} (${notable.permit.type.toLowerCase()}, ${notable.permit.status.toLowerCase()}).`,
      [notable.id]);
  }

  // Only a clear gap over the vacant-unit average flags; the all-units average includes long-time tenants, so a new
  // lease can't fairly be judged against it.
  if (listing && refs.rent && listing.kind === "vacant_units" && listing.diff > 0 && listing.pct >= MIN_PRICE_GAP_PCT) {
    flag(18,
      `Asks ${money(listing.rent)} a month — ${money(listing.diff)} (${listing.pct}%) above CMHC's vacant-unit average for ${listing.noun} rentals in the area.`,
      [refs.rent]);
  }

  const reg = extras?.registration;
  if (reg && refs.registration && isNone(reg.air_conditioning_type) && reg.has_cooling_room !== true) {
    flag(30,
      `No air conditioning${reg.has_cooling_room === false ? " and no cooling room" : ""} on the building's City registration.`,
      [refs.registration]);
  }

  if (b.in_rentsafe && rentControl(b.year_built) === "likely_exempt") {
    flag(22, `Likely exempt from Ontario's rent-increase guideline (built in ${b.year_built}); confirm with the landlord.`, [refs.latest]);
  }

  const crimeFacts = refs.crime ? set.evidence.items.find((i) => i.id === refs.crime)?.facts : undefined;
  const comparedTypes = crimeFacts?.offence_types_compared;
  const aboveTypes = crimeFacts?.offence_types_above_toronto_rate;
  const hood = brief.area.neighbourhood?.name;
  if (refs.crime && hood && typeof comparedTypes === "number" && typeof aboveTypes === "number"
    && comparedTypes > 0 && aboveTypes * 2 > comparedTypes) {
    flag(40, `In ${hood}, ${aboveTypes} of ${comparedTypes} offence types reported by Toronto Police had ${brief.crime.year} rates above Toronto's.`, [refs.crime]);
  }

  const sentences = candidates.sort((x, y) => x.priority - y.priority).slice(0, MAX_FLAGS).map((c) => c.line);

  // Checklist, unchanged from before the panel became flags.
  if (e && refs.latest) {
    for (const item of lowest.filter((i) => i.score < e.item_scale_max).slice(0, 2)) {
      say(checklist, `The City's last evaluation${e.date ? ` (${dateLabel(e.date)})` : ""} graded ${item.item.toLowerCase()} ${item.score} of ${e.item_scale_max}. What has been fixed since?`, [refs.latest]);
    }
  }
  if (reg && refs.registration && isNone(reg.air_conditioning_type) && reg.has_cooling_room !== true) {
    say(checklist, `How do units stay cool in summer without air conditioning${reg.has_cooling_room === false ? " or a cooling room" : ""}?`, [refs.registration]);
  }
  const rc = b.in_rentsafe ? rentControl(b.year_built) : "unknown";
  say(checklist, rc === "likely_covered"
    ? "Is this unit covered by the rent-increase guideline, and what were the most recent increases?"
    : rc === "likely_exempt"
      ? `Was this unit first occupied after ${RENT_CONTROL_CUTOFF}? If so, how are rent increases decided?`
      : "When was this unit first occupied, and is it covered by rent control?",
  [b.in_rentsafe ? refs.latest : refs.address]);
  const activePermit = refs.permits.find((p) => p.active);
  if (activePermit) {
    say(checklist, `The City lists an active ${activePermit.type.toLowerCase()} permit at this address. What work is planned, and how will it affect tenants?`, [activePermit.id]);
  }
  if (notable) {
    say(checklist, `A major building permit is active ${Math.round(notable.permit.distance_m)} m away${notable.permit.address ? ` at ${titleCase(notable.permit.address)}` : ""}. Will construction noise or access affect this unit?`, [notable.id]);
  } else if (near) {
    say(checklist, `A development application is open ${Math.round(near.app.distance_m)} m away${near.app.address ? ` at ${titleCase(near.app.address)}` : ""}. Is construction expected nearby, and how would tenants be told?`, [near.id]);
  }
  if (reg?.heating_type && refs.registration) {
    say(checklist, "Who do I contact when the heat isn't working, and how quickly is it usually fixed?", [refs.registration]);
  }
  if (!b.in_rentsafe) {
    say(checklist, "Who handles maintenance requests, and how do I reach them after hours?", [refs.address]);
  }

  return { sentences, checklist: checklist.slice(0, MAX_QUESTIONS) };
}

/** Deterministic, cited flags and checklist built without AI (model "template"). */
export function templateSummary(
  brief: Brief,
  extras: Extras | null,
  now: Date = new Date(),
  listing: ListingContext = null,
): Summary {
  const set = buildEvidence(brief, extras);
  return toSummary(templateLines(brief, extras, set, listing), set.cites, TEMPLATE_MODEL, now);
}

// Requests and cache keys ---------------------------------------------------------------------------------------

export type RadiusLimits = { min: number; max: number; default: number };
export type SummaryKey = { address_point_id: number; radius_m: number; rent: number | null; beds: number | null };

/** SummaryRequest -> key, or an error message for a 400. rent and beds let the flags rank the asking rent. */
export function parseSummaryRequest(
  body: unknown,
  radius: RadiusLimits,
): { ok: true; value: SummaryKey } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: "Send JSON: { address_point_id, radius_m?, rent?, beds? }." };
  const id = body.address_point_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: "address_point_id must be a positive whole number." };
  }
  const r = body.radius_m ?? radius.default;
  if (typeof r !== "number" || !Number.isInteger(r) || r < radius.min || r > radius.max) {
    return { ok: false, error: `radius_m must be a whole number of metres from ${radius.min} to ${radius.max}.` };
  }
  let rent: number | null = null;
  if (body.rent !== undefined && body.rent !== null) {
    if (typeof body.rent !== "number" || !Number.isFinite(body.rent) || body.rent < 100 || body.rent > 50_000) {
      return { ok: false, error: "rent must be a monthly amount in dollars from 100 to 50,000, or left out." };
    }
    rent = Math.round(body.rent);
  }
  let beds: number | null = null;
  if (body.beds !== undefined && body.beds !== null) {
    if (typeof body.beds !== "number" || !Number.isInteger(body.beds) || body.beds < 0 || body.beds > 10) {
      return { ok: false, error: "beds must be a whole number from 0 (bachelor) to 10, or left out." };
    }
    beds = body.beds;
  }
  return { ok: true, value: { address_point_id: id, radius_m: r, rent, beds } };
}

export const summaryCacheKey = (k: SummaryKey) =>
  `${k.address_point_id}:${k.radius_m}:${k.rent ?? "-"}:${k.beds ?? "-"}`;
