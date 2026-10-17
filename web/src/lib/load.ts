import { cacheLife } from "next/cache";

import {
  type AddressMatch, type Brief, DEFAULT_RADIUS_M, type RentSafeStats, geocode, getBrief, getRentSafeStats,
} from "./brief";
import { type Extras, getExtras } from "./extras";

export type BriefResult =
  | { kind: "ok"; brief: Brief; stats: RentSafeStats | null; extras: Extras | null }
  | { kind: "not_found"; message: string };

/**
 * The brief for one address point, with the extras (building registration, CMHC rents) fetched alongside it.
 * Cached for an hour: the data only changes when the ETL reloads it.
 */
export async function loadBrief(addressPointId: number, radius = DEFAULT_RADIUS_M): Promise<BriefResult> {
  "use cache";
  cacheLife("hours");
  const [brief, stats, extras] = await Promise.all([
    getBrief(addressPointId, radius), getRentSafeStats(), loadExtras(addressPointId),
  ]);
  if (!brief) return { kind: "not_found", message: "There is no Toronto address point with this ID." };
  return { kind: "ok", brief, stats, extras };
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
