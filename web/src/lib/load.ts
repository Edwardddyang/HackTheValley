import { cacheLife } from "next/cache";

import {
  type AddressMatch, type Brief, DEFAULT_RADIUS_M, type RentSafeStats, geocode, getBrief, getConstructionNear, getRentSafeStats,
} from "./brief";
import { type Extras, getExtras } from "./extras";

export type BriefResult =
  | { kind: "ok"; brief: Brief; stats: RentSafeStats | null; extras: Extras | null }
  | { kind: "not_found"; message: string };

/**
 * The brief for one address point, with the extras (building registration, CMHC rents) and nearby construction
 * fetched alongside it. Cached for an hour, since the data only changes when the ETL reloads it, except when the
 * optional construction lookup failed: that result is kept only briefly, so the next visit tries again.
 */
export async function loadBrief(addressPointId: number, radius = DEFAULT_RADIUS_M): Promise<BriefResult> {
  "use cache";
  const [brief, stats, extras, near] = await Promise.all([
    getBrief(addressPointId, radius), getRentSafeStats(), loadExtras(addressPointId), getConstructionNear(addressPointId, radius),
  ]);
  if (brief && !near) cacheLife("seconds");
  else cacheLife("hours");
  if (!brief) return { kind: "not_found", message: "There is no Toronto address point with this ID." };
  return { kind: "ok", brief: { ...brief, construction_near: near }, stats, extras };
}

/** The extras are optional context: if bb_extras fails, the brief still renders without them. */
async function loadExtras(addressPointId: number): Promise<Extras | null> {
  try {
    return await getExtras(addressPointId);
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** Best address matches for free text (used for old ?address= links and the examples list). */
export async function resolveAddress(text: string): Promise<AddressMatch[]> {
  "use cache";
  cacheLife("hours");
  return geocode(text);
}
