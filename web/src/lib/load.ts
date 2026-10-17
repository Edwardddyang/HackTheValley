import { cacheLife } from "next/cache";

import {
  type AddressMatch, type Brief, DEFAULT_RADIUS_M, type RentSafeStats, geocode, getBrief, getRentSafeStats,
} from "./brief";

export type BriefResult =
  | { kind: "ok"; brief: Brief; stats: RentSafeStats | null }
  | { kind: "not_found"; message: string };

/** The brief for one address point. Cached for an hour: the data only changes when the ETL reloads it. */
export async function loadBrief(addressPointId: number, radius = DEFAULT_RADIUS_M): Promise<BriefResult> {
  "use cache";
  cacheLife("hours");
  const [brief, stats] = await Promise.all([getBrief(addressPointId, radius), getRentSafeStats()]);
  if (!brief) return { kind: "not_found", message: "There is no Toronto address point with this ID." };
  return { kind: "ok", brief, stats };
}

/** Best address matches for free text (used for old ?address= links and the examples list). */
export async function resolveAddress(text: string): Promise<AddressMatch[]> {
  "use cache";
  cacheLife("hours");
  return geocode(text);
}
