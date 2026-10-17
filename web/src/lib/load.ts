import { cacheLife } from "next/cache";

import { type AddressMatch, type Brief, DEFAULT_RADIUS_M, geocode, getBrief } from "./brief";
import { type Extras, getExtras } from "./extras";

export type BriefResult =
  | {
      kind: "ok"; brief: Brief; extras: Extras | null; alternatives: AddressMatch[];
      /** True when the dev-only fixture below was served instead of the database. */
      fixture: boolean;
    }
  | { kind: "not_found"; message: string };

/**
 * Geocode (unless an address_point_id is given) and build the brief, with the extras
 * (registration, CMHC rents) fetched alongside it. Cached for an hour: the data only changes
 * when the ETL reloads it.
 */
export async function loadBrief(address: string | null, id: number | null, radius = DEFAULT_RADIUS_M): Promise<BriefResult> {
  "use cache";
  cacheLife("hours");

  if (devFixtureEnabled()) return devFixture();

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
  const [brief, extras] = await Promise.all([getBrief(addressPointId, radius), loadExtras(addressPointId)]);
  if (!brief) return { kind: "not_found", message: "That address is no longer in the address register." };
  return { kind: "ok", brief, extras, alternatives, fixture: false };
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

// --- Development without credentials ------------------------------------------------------
// A fresh checkout has no web/.env.local, so every database call would throw. Under `next dev`
// only, when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing, every address gets the saved real
// brief for 375 Brunswick Ave (bb_brief(778448, 500) and its bb_extras output, in
// src/fixtures/) so the UI can be worked on. The page shows a banner saying so.
// Production never takes this branch: supabase() throws and the page reports the failure.

function devFixtureEnabled() {
  return process.env.NODE_ENV !== "production" && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

async function devFixture(): Promise<BriefResult> {
  const [brief, extras] = await Promise.all([
    import("@/fixtures/brief-375-brunswick.json").then((m) => m.default as unknown as Brief),
    import("@/fixtures/extras-375-brunswick.json").then((m) => m.default as unknown as Extras),
  ]);
  return { kind: "ok", brief, extras, alternatives: [], fixture: true };
}
