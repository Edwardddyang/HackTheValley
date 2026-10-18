import type { Brief, Cite } from "./brief";

// Construction & noise score for an address, from the brief alone: major permits nearby (the brief's
// "notable" list) and 311 noise complaints, each weighted by distance. A rough guide to how much
// building work and noise is around, not a measurement of sound.

/** Distance weight: 1 / (1 + (d/150)^2). Sound intensity falls with distance squared, so a source
 *  150 m away counts half as much as one next door: 45 m ≈ 0.92, 100 m ≈ 0.69, 250 m ≈ 0.26, 500 m ≈ 0.08. */
export const DECAY_M = 150;
export const decay = (distanceM: number) => 1 / (1 + (Math.max(0, distanceM) / DECAY_M) ** 2);

/** New buildings and demolitions are the long, loud jobs; other $1M+ work counts for less. */
export const permitWeight = (type: string) => (/new building|demolition/i.test(type) ? 3 : 1.5);
export const COMPLAINT_WEIGHT = 0.5;
/** Complaints together add at most this much, below the High cutoff: 311 snaps complaints to the nearest
 *  intersection, so one loud corner can raise the level but never make it High on its own. */
export const COMPLAINT_CAP = 2;

/** One new building within ~100 m is Moderate (3 × 0.69 = 2.1); two within 150 m (2 × 3 × 0.5 = 3), or one within
 *  50 m plus other major work, is High. Checked against 375 Brunswick Ave, 200 Elm St, 326 Avenue Rd and
 *  2000 Eglinton Ave E (see noise.test.ts). */
export const NOISE_LEVELS = { moderate: 2, high: 3 } as const;
export type NoiseLevel = "Low" | "Moderate" | "High";

export const isNoiseComplaint = (type: string) => /noise/i.test(type);

export type ConstructionNoise = {
  score: number;
  level: NoiseLevel;
  /** Points from permits and from (capped) complaints, which add up to `score`. */
  parts: { permits: number; complaints: number };
  /** The nearest major project (a site with several permits is one project, named by its heaviest permit). */
  nearest: { distance_m: number; type: string; address: string | null } | null;
  /** Major projects (sites), not permits. */
  major_within_250: number;
  major_within_500: number;
  /** The brief lists only the 10 costliest major permits, so counts (and the score) are a floor when this is true. */
  major_list_capped: boolean;
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

/** Scores are shown out of 10. The raw sum has no ceiling, but 10 is past the busiest downtown blocks we checked
 *  (1 Yonge St scores 7.3), so anything above it displays as 10 / 10. */
export const NOISE_SCALE = 10;
export function noiseScoreLabel(score: number) {
  return `${Number(Math.min(NOISE_SCALE, score).toFixed(1))} / ${NOISE_SCALE}`;
}
export const NOISE_LEVELS_NOTE = `Low under ${NOISE_LEVELS.moderate}, Moderate ${NOISE_LEVELS.moderate} to ${NOISE_LEVELS.high}, High ${NOISE_LEVELS.high} and up`;

type Permit = Brief["construction_nearby"]["notable"][number];

/** One project often has several permits at the same point (a new building plus its drain and site service
 *  permit), so each site counts once, at its heaviest permit's weight. */
export function majorProjects(brief: Brief): Permit[] {
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

  const score = Math.round((permits + complaints) * 10) / 10;
  const nearestPermit = projects.reduce<(typeof notable)[number] | null>((a, p) => (!a || p.distance_m < a.distance_m ? p : a), null);
  return {
    score,
    level: noiseLevel(score),
    parts: { permits: Math.round(permits * 10) / 10, complaints: Math.round(complaints * 10) / 10 },
    nearest: nearestPermit && { distance_m: nearestPermit.distance_m, type: nearestPermit.type, address: nearestPermit.address },
    major_within_250: projects.filter((p) => p.distance_m <= 250).length,
    major_within_500: projects.filter((p) => p.distance_m <= 500).length,
    major_list_capped: notable.length >= NOTABLE_LIMIT,
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
