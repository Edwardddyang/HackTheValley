import type { Brief, Cite } from "./brief";

// Construction & noise score for an address: major permit sites within 500 m (bb_construction_near, attached to
// the brief by getBrief; without it, the brief's 10 costliest major permits) and 311 noise complaints, each
// weighted by distance. A rough guide to how much building work and noise is around, not a measurement of sound.

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
 *  sample of address points (392 of 400 scored, Oct 2026) at every 5th percentile (0, 5, … 100), from
 *  scripts/calibrate-noise.mjs.
 *  A score of 7 / 10 means busier than about 70% of Toronto addresses. */
export const NOISE_PERCENTILES: readonly number[] = [
  0, 0, 0.2, 0.4, 0.6, 0.8, 1.2, 1.6, 1.9, 2.1, 2.6, 2.9, 3.4, 4.1, 4.9, 5.8, 6.7, 8.4, 9.7, 12.3, 26.6,
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
  /** All active permits within the search radius, major or not. */
  active_permits: number;
  noise_complaints_within_250: number;
  noise_complaints_within_radius: number;
  noise_period: { from: string | null; to: string | null };
  radius_m: number;
  /** Source rows behind the counts: the major permits within 500 m and the noise complaints within 250 m. */
  cites: { major: Cite | null; complaints: Cite | null };
};

/** One row, or a row count with up to five sample rows, from the same file. */
function citeRows(base: { dataset: string; file: string } | null | undefined, rows: number[]): Cite | null {
  if (!base || !rows.length) return null;
  return rows.length === 1 ? { dataset: base.dataset, file: base.file, row: rows[0] }
    : { dataset: base.dataset, file: base.file, row_count: rows.length, sample_rows: rows.slice(0, 5) };
}
const rowOf = (c: Cite) => ("row" in c ? [c.row] : c.sample_rows ?? []);

/** The brief lists at most this many major permits (supabase/migrations/0002_brief.sql). */
const NOTABLE_LIMIT = 10;

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
 *  sites; the fallback groups the brief's own list the same way. */
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
  const corners: Record<string, { lat: number; lon: number; n: number }> = {};
  for (const p of brief.service_requests_311.nearby.points) {
    if (!isNoiseComplaint(p.type) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    (corners[`${p.lat.toFixed(6)},${p.lon.toFixed(6)}`] ??= { lat: p.lat, lon: p.lon, n: 0 }).n += 1;
  }
  return [
    ...majorProjects(brief).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({ lat: p.lat, lon: p.lon, weight: permitWeight(p.type), kind: "permit" as const, count: 1 })),
    ...Object.values(corners).map((c) => ({
      lat: c.lat, lon: c.lon, weight: COMPLAINT_WEIGHT * Math.min(c.n, HEAT_PER_INTERSECTION), kind: "complaints" as const, count: c.n,
    })),
  ];
}

export function constructionNoise(brief: Brief): ConstructionNoise {
  const { lat, lon, radius_m } = brief.address;
  const notable = brief.construction_nearby.notable;
  const projects = majorProjects(brief);
  const permits = projects.reduce((sum, p) => sum + permitWeight(p.type) * decay(p.distance_m), 0);

  const noisePoints = brief.service_requests_311.nearby.points
    .filter((p) => isNoiseComplaint(p.type) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({ row: p.row, d: distanceM(lat, lon, p.lat, p.lon) }));
  const complaintDistances = noisePoints.map((p) => p.d);
  const complaints = Math.min(COMPLAINT_CAP, complaintDistances.reduce((sum, d) => sum + COMPLAINT_WEIGHT * decay(d), 0));

  const rawScore = Math.round((permits + complaints) * 10) / 10;
  const score = Math.round(noiseRank(rawScore)) / 10;
  const near = brief.construction_near;
  const nearestPermit = projects.reduce<Permit | null>((a, p) => (!a || p.distance_m < a.distance_m ? p : a), null);
  return {
    score,
    rawScore,
    level: noiseLevel(score),
    parts: { permits: Math.round(permits * 10) / 10, complaints: Math.round(complaints * 10) / 10 },
    nearest: nearestPermit && { distance_m: nearestPermit.distance_m, type: nearestPermit.type, address: nearestPermit.address },
    // bb_construction_near counts every site; the fallback list is the 10 costliest permits, so a floor.
    major_within_250: near ? near.sites_within_250 : projects.filter((p) => p.distance_m <= 250).length,
    major_within_500: near ? near.sites_within_500 : projects.filter((p) => p.distance_m <= 500).length,
    major_list_capped: !near && notable.length >= NOTABLE_LIMIT,
    major_reach_m: near ? near.within_m : Math.min(500, radius_m),
    active_permits: brief.construction_nearby.active_permit_count,
    noise_complaints_within_250: complaintDistances.filter((d) => d <= 250).length,
    noise_complaints_within_radius: complaintDistances.length,
    noise_period: brief.service_requests_311.period,
    radius_m,
    cites: {
      major: citeRows(projects[0]?.cite, projects.filter((p) => p.distance_m <= 500).flatMap((p) => rowOf(p.cite))),
      complaints: citeRows(brief.service_requests_311.nearby.top_types[0]?.cite, noisePoints.filter((p) => p.d <= 250).map((p) => p.row)),
    },
  };
}
