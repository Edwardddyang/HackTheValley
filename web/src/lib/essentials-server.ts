import "server-only";

import file from "../../public/amenities-toronto.json";

import { nearestAmenities, type PackedAmenity } from "./amenities";

// The map's essentials (an OpenStreetMap extract, public/amenities-toronto.json), read on the server so the ad check
// can judge claims like "steps to the subway" against the same nearest station the map shows.

export type Essentials = ReturnType<typeof nearestAmenities> & { asof: string | null; file: string };

export function essentialsNear(lat: number, lon: number): Essentials {
  const data = file as { asof?: string; items?: PackedAmenity[] };
  return { ...nearestAmenities(data.items ?? [], lat, lon), asof: data.asof ?? null, file: "amenities-toronto.json" };
}
