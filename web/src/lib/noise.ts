import type { Brief, Cite } from "./brief";
import { distanceM } from "./geo.ts";

export { distanceM };

// Construction & noise score for an address: major permit sites and 311 noise complaints within a fixed 500 m,
// each weighted by distance, from bb_construction_near (attached to the brief by loadBrief). Without it, the
// score falls back to the brief's own lists: its 10 costliest major permits and the 311 points in its radius.
// A rough guide to how much building work and noise is around, not a measurement of sound.

/** The score looks this far, whatever radius the reader picked, so it doesn't change with the radius. */
export const SCORE_REACH_M = 500;

/** Distance weight: 1 / (1 + (d/150)^2). Sound intensity falls with distance squared, so a source
 *  150 m away counts half as much as one next door: 45 m ≈ 0.92, 100 m ≈ 0.69, 250 m ≈ 0.26, 500 m ≈ 0.08. */
export const DECAY_M = 150;
export const decay = (distanceM: number) => 1 / (1 + (Math.max(0, distanceM) / DECAY_M) ** 2);

/** New buildings and demolitions are the long, loud jobs (3). Mostly indoor work (small residential projects,
 *  mechanical, plumbing, drains, fire and security upgrades) counts least (0.5), even at $1M+; other $1M+ work,
 *  such as additions, alterations and new houses, is in between (1.5). */
export const permitWeight = (type: string) =>
  /new building|demolition/i.test(type) ? 3 : /small residential|mechanical|plumbing|drain|fire\/security/i.test(type) ? 0.5 : 1.5;
export const COMPLAINT_WEIGHT = 0.5;
/** Complaints together add at most this much: 311 snaps complaints to the nearest intersection, so one loud
 *  corner can raise the score but not decide it. */
export const COMPLAINT_CAP = 2;

/** The raw sum has no natural scale, so the score is where it ranks in Toronto: the raw score of a fixed random
 *  sample of 400 address points (all scored, Oct 2026) at every 5th percentile (0, 5, … 100), from
 *  scripts/calibrate-noise.mjs.
 *  A score of 7 / 10 means busier than about 70% of Toronto addresses. */
export const NOISE_PERCENTILES: readonly number[] = [
  0, 0, 0.2, 0.4, 0.6, 0.9, 1.2, 1.6, 1.9, 2.2, 2.7, 3, 3.6, 4.3, 5, 5.9, 6.8, 8.5, 10.1, 12.3, 26.6,
];

/** Percentile rank (0-100) of a raw score in the sample; ties (many quiet addresses score 0) take the middle. */
export function noiseRank(raw: number): number {
  const p = NOISE_PERCENTILES;
  const step = 100 / (p.length - 1);
  if (raw > p[p.length - 1]) return 100;
  const lo = p.findIndex((v) => v >= raw);
  if (p[lo] === raw) {
    let hi = lo;
    while (hi + 1 < p.length && p[hi + 1] === raw) hi++;
    return ((lo + hi) / 2) * step;
  }
  if (lo <= 0) return 0;
  return (lo - 1 + (raw - p[lo - 1]) / (p[lo] - p[lo - 1])) * step;
}

/** Levels on the 0-10 score: High is the busiest fifth of Toronto addresses, Low the quieter half. */
export const NOISE_LEVELS = { moderate: 5, high: 8 } as const;
export type NoiseLevel = "Low" | "Moderate" | "High";

export const isNoiseComplaint = (type: string) => /noise/i.test(type);

export type ConstructionNoise = {
  /** 0-10: the raw score's percentile rank among Toronto addresses, divided by 10. */
  score: number;
  /** The weighted sum the score ranks: permits plus (capped) complaints, each weighted by distance. */
  rawScore: number;
  level: NoiseLevel;
  /** Points from permits and from (capped) complaints, which add up to `rawScore`. */
  parts: { permits: number; complaints: number };
  /** The nearest major project (a site with several permits is one project, named by its heaviest permit). */
  nearest: { distance_m: number; type: string; address: string | null } | null;
  /** Major projects (sites), not permits, within 250 m and 500 m of the address (whatever the brief's radius). */
  major_within_250: number;
  major_within_500: number;
  /** True only without bb_construction_near: the brief lists just the 10 costliest major permits, so counts (and
   *  the score) are a floor. */
  major_list_capped: boolean;
  /** How far major_within_500 reaches: 500 m with bb_construction_near, else the brief's radius if smaller. */
  major_reach_m: number;
  /** How far the complaint counts reach: 500 m with bb_construction_near, else the brief's radius. */
  noise_reach_m: number;
  /** All active permits within the search radius, major or not. */
  active_permits: number;
  noise_complaints_within_250: number;
  /** Noise complaints within noise_reach_m. */
  noise_complaints_within_reach: number;
  noise_period: { from: string | null; to: string | null };
  radius_m: number;
  /** Source rows behind the counts: the major permits within 500 m and the noise complaints within 250 m. */
  cites: { major: Cite | null; complaints: Cite | null };
};

/** One row, or a row count (`total`, defaulting to the rows given) with up to five sample rows, from one file. */
function citeRows(base: { dataset: string; file: string } | null | undefined, rows: number[], total = rows.length): Cite | null {
  if (!base || !rows.length) return null;
  return total === 1 ? { dataset: base.dataset, file: base.file, row: rows[0] }
    : { dataset: base.dataset, file: base.file, row_count: total, sample_rows: rows.slice(0, 5) };
}
const rowOf = (c: Cite) => ("row" in c ? [c.row] : c.sample_rows ?? []);

/** The brief lists at most this many major permits (supabase/migrations/0002_brief.sql). */
const NOTABLE_LIMIT = 10;

export function noiseLevel(score: number): NoiseLevel {
  return score >= NOISE_LEVELS.high ? "High" : score >= NOISE_LEVELS.moderate ? "Moderate" : "Low";
}

export const NOISE_SCALE = 10;
export function noiseScoreLabel(score: number) {
  return `${Number(Math.min(NOISE_SCALE, score).toFixed(1))} / ${NOISE_SCALE}`;
}
export const NOISE_LEVELS_NOTE = `Ranked against Toronto addresses: 7 / 10 means busier than about 70% of them. `
  + `Low under ${NOISE_LEVELS.moderate}, Moderate ${NOISE_LEVELS.moderate} to ${NOISE_LEVELS.high}, High ${NOISE_LEVELS.high} and up`;

type Permit = Pick<Brief["construction_nearby"]["notable"][number], "lat" | "lon" | "type" | "address" | "distance_m" | "cite">;

/** One project often has several permits at the same point (a new building plus its drain and site service
 *  permit), so each site counts once, at its heaviest permit's weight. bb_construction_near already returns
 *  sites (out to the brief's radius, at least 500 m); the fallback groups the brief's own list the same way. */
export function majorProjects(brief: Brief): Permit[] {
  if (brief.construction_near) return brief.construction_near.sites;
  const sites: Record<string, Permit> = {};
  for (const p of brief.construction_nearby.notable) {
    const key = Number.isFinite(p.lat) && Number.isFinite(p.lon) ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : `${p.address}|${p.distance_m}`;
    if (!sites[key] || permitWeight(p.type) > permitWeight(sites[key].type)) sites[key] = p;
  }
  return Object.values(sites);
}

/** At most this many complaints count per intersection on the map heatmap (311 snaps them to intersections). */
export const HEAT_PER_INTERSECTION = 10;

/** Weighted points for a heatmap, using the score's weights without distance (the map shows distance itself). */
export function noiseSources(brief: Brief): { lat: number; lon: number; weight: number; kind: "permit" | "complaints"; count: number }[] {
  const corners = noiseCorners(brief);
  return [
    ...majorProjects(brief).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({ lat: p.lat, lon: p.lon, weight: permitWeight(p.type), kind: "permit" as const, count: 1 })),
    ...corners.map((c) => ({
      lat: c.lat, lon: c.lon, weight: COMPLAINT_WEIGHT * Math.min(c.n, HEAT_PER_INTERSECTION), kind: "complaints" as const, count: c.n,
    })),
  ];
}

type Corner = { lat: number; lon: number; d: number; n: number; rows: number[] };

/** Noise complaints grouped by intersection, with their distance from the address: from bb_construction_near
 *  (a fixed 500 m), else from the brief's own 311 points (its radius, at most the 800 most recent). */
function noiseCorners(brief: Brief): Corner[] {
  const near = brief.construction_near;
  if (near) return near.noise_corners.map((c) => ({ lat: c.lat, lon: c.lon, d: c.distance_m, n: c.count, rows: c.sample_rows }));
  const { lat, lon } = brief.address;
  const by: Record<string, Corner> = {};
  for (const p of brief.service_requests_311.nearby.points) {
    if (!isNoiseComplaint(p.type) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const c = (by[`${p.lat.toFixed(6)},${p.lon.toFixed(6)}`] ??= { lat: p.lat, lon: p.lon, d: distanceM(lat, lon, p.lat, p.lon), n: 0, rows: [] });
    c.n += 1;
    if (c.rows.length < 5) c.rows.push(p.row);
  }
  return Object.values(by);
}

export function constructionNoise(brief: Brief): ConstructionNoise {
  const { radius_m } = brief.address;
  const notable = brief.construction_nearby.notable;
  const near = brief.construction_near;
  // The score counts sites within SCORE_REACH_M; the map may show more (out to a 1 km radius).
  const projects = majorProjects(brief).filter((p) => p.distance_m <= SCORE_REACH_M);
  const permits = projects.reduce((sum, p) => sum + permitWeight(p.type) * decay(p.distance_m), 0);

  const corners = noiseCorners(brief).filter((c) => c.d <= SCORE_REACH_M);
  const complaints = Math.min(COMPLAINT_CAP, corners.reduce((sum, c) => sum + c.n * COMPLAINT_WEIGHT * decay(c.d), 0));
  const within250 = corners.filter((c) => c.d <= 250);
  const complaintsWithin250 = within250.reduce((n, c) => n + c.n, 0);
  const major500 = near ? near.sites_within_500 : projects.length;

  const rawScore = Math.round((permits + complaints) * 10) / 10;
  const score = Math.round(noiseRank(rawScore)) / 10;
  const nearestPermit = projects.reduce<Permit | null>((a, p) => (!a || p.distance_m < a.distance_m ? p : a), null);
  return {
    score,
    rawScore,
    level: noiseLevel(score),
    parts: { permits: Math.round(permits * 10) / 10, complaints: Math.round(complaints * 10) / 10 },
    nearest: nearestPermit && { distance_m: nearestPermit.distance_m, type: nearestPermit.type, address: nearestPermit.address },
    // bb_construction_near counts every site; the fallback list is the 10 costliest permits, so a floor.
    major_within_250: near ? near.sites_within_250 : projects.filter((p) => p.distance_m <= 250).length,
    major_within_500: major500,
    major_list_capped: !near && notable.length >= NOTABLE_LIMIT,
    major_reach_m: near ? SCORE_REACH_M : Math.min(SCORE_REACH_M, radius_m),
    active_permits: brief.construction_nearby.active_permit_count,
    noise_reach_m: near ? near.noise_within_m : radius_m,
    noise_complaints_within_250: complaintsWithin250,
    noise_complaints_within_reach: corners.reduce((n, c) => n + c.n, 0),
    noise_period: near?.noise_source ? { from: near.noise_source.from, to: near.noise_source.to } : brief.service_requests_311.period,
    radius_m,
    // Each cite's row count matches the figure it sits beside: one row per site, one per complaint.
    cites: {
      major: citeRows(projects[0]?.cite, projects.flatMap((p) => rowOf(p.cite)), major500),
      complaints: citeRows(near?.noise_source ?? brief.service_requests_311.nearby.top_types[0]?.cite,
        within250.flatMap((c) => c.rows), complaintsWithin250),
    },
  };
}
