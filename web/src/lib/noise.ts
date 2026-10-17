import type { Brief } from "./brief";

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
};

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

export function constructionNoise(brief: Brief): ConstructionNoise {
  const { lat, lon, radius_m } = brief.address;
  const notable = brief.construction_nearby.notable;
  // One project often has several permits at the same point (a new building plus its drain and site
  // service permit), so each site counts once, at its heaviest permit's weight.
  const sites: Record<string, (typeof notable)[number]> = {};
  for (const p of notable) {
    const key = Number.isFinite(p.lat) && Number.isFinite(p.lon) ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : `${p.address}|${p.distance_m}`;
    if (!sites[key] || permitWeight(p.type) > permitWeight(sites[key].type)) sites[key] = p;
  }
  const projects = Object.values(sites);
  const permits = projects.reduce((sum, p) => sum + permitWeight(p.type) * decay(p.distance_m), 0);

  const complaintDistances = brief.service_requests_311.nearby.points
    .filter((p) => isNoiseComplaint(p.type) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => distanceM(lat, lon, p.lat, p.lon));
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
  };
}
