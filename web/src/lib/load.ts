import { cacheLife } from "next/cache";

import { type AddressMatch, type Brief, DEFAULT_RADIUS_M, geocode, getBrief } from "./brief";

export type BriefResult =
  | { kind: "ok"; brief: Brief; alternatives: AddressMatch[] }
  | { kind: "not_found"; message: string };

/**
 * Geocode (unless an address_point_id is given) and build the brief. Cached for an hour:
 * the data only changes when the ETL reloads it.
 */
export async function loadBrief(address: string | null, id: number | null, radius = DEFAULT_RADIUS_M): Promise<BriefResult> {
  "use cache";
  cacheLife("hours");

  let addressPointId = id;
  let alternatives: AddressMatch[] = [];
  if (addressPointId == null) {
    const matches = address ? await geocode(address) : [];
    if (!matches.length) {
      return { kind: "not_found", message: `No Toronto address matched "${address}". Include the street number, e.g. "100 Queen St W".` };
    }
    addressPointId = matches[0].address_point_id;
    alternatives = matches.slice(1);
  }
  const brief = await getBrief(addressPointId, radius);
  if (!brief) return { kind: "not_found", message: "That address is no longer in the address register." };
  return { kind: "ok", brief, alternatives };
}
