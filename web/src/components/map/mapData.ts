import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

import { type Amenity, AMENITY_LABELS } from "@/lib/amenities";
import type { Brief } from "@/lib/brief";
import { compactMoney, metres, titleCase } from "@/lib/format";

// From feature/frontend (Satwik): layers, radius geometry and the location list, fed by bb_brief.

export type LatLng = { lat: number; lng: number };

export const layerLabels = {
  building: "This address",
  radius: "Search radius",
  rentsafe: "RentSafeTO buildings (score)",
  building_permit: "Major construction sites",
  development_application: "Open development applications",
  sr311: "311 requests at intersections",
  amenity: "Essentials (OpenStreetMap)",
} as const;
export type LayerId = keyof typeof layerLabels;
export type LayerVisibility = Record<LayerId, boolean>;
export const defaultLayers = Object.fromEntries(Object.keys(layerLabels).map((key) => [key, true])) as LayerVisibility;

/** Layers drawn as individual, focusable markers (311 points are a plain map layer instead). */
export type MarkerLayer = "building" | "rentsafe" | "building_permit" | "development_application" | "amenity";

export type MapLocation = {
  id: string;
  name: string;
  layer: MarkerLayer;
  location: LatLng;
  description: string;
  distanceM: number | null;
  label?: string; // short text drawn on the marker
  url?: string | null;
  /** Essentials only: subway, grocery, pharmacy or hospital. */
  category?: Amenity["category"];
  /** Permits only: the site has a row in the Construction tab's major-projects list (its 10 largest). */
  listed?: boolean;
};

/** Map location id of a major construction site; brief rows link to it by the same id. Sites are keyed by their
 *  point to 5 decimals, as bb_construction_near groups them, so several permits at one address are one marker. */
export const permitSiteId = (lat: number, lon: number) => `permit-${lat.toFixed(5)},${lon.toFixed(5)}`;

/** Every major construction site within the search radius (bb_construction_near reaches 500 m), plus any of the
 *  brief's 10 largest that lie beyond it. A site in the Construction tab's list keeps that row's description. */
function permitLocations(brief: Brief): MapLocation[] {
  const listed = new Map<string, Brief["construction_nearby"]["notable"][number]>();
  for (const p of brief.construction_nearby.notable) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lon) && !listed.has(permitSiteId(p.lat, p.lon))) listed.set(permitSiteId(p.lat, p.lon), p);
  }
  const out: MapLocation[] = [];
  const seen = new Set<string>();
  for (const site of brief.construction_near?.sites ?? []) {
    if (site.distance_m > brief.address.radius_m) continue;
    const id = permitSiteId(site.lat, site.lon);
    const row = listed.get(id);
    seen.add(id);
    out.push({
      id, name: titleCase(site.address), layer: "building_permit", location: { lat: site.lat, lng: site.lon },
      distanceM: site.distance_m, listed: !!row,
      description: row ? [row.type, row.status, row.description].filter(Boolean).join(" · ")
        : [site.type, site.status, site.est_const_cost ? `est. ${compactMoney(site.est_const_cost)}` : null,
          site.permits > 1 ? `${site.permits} permits at this address` : null].filter(Boolean).join(" · "),
    });
  }
  for (const [id, p] of listed) {
    if (seen.has(id)) continue;
    out.push({
      id, name: titleCase(p.address), layer: "building_permit", location: { lat: p.lat, lng: p.lon }, distanceM: p.distance_m,
      listed: true, description: [p.type, p.status, p.description].filter(Boolean).join(" · "),
    });
  }
  return out;
}

/** "Map" pills on brief rows (ShowOnMap.tsx) dispatch this window event with a map location id. */
export const SHOW_ON_MAP_EVENT = "rentreceipts:show-on-map";
export type ShowOnMapDetail = { id: string };

/** The DOM id of a brief row for a map location, so a popup can scroll back to it. */
export const mapRowId = (locationId: string) => `maprow-${locationId.replace(/\s+/g, "_")}`;

export function isValidLocation(location: LatLng | null | undefined): location is LatLng {
  return !!location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}

/** Great-circle destinations on a mean-radius Earth, rather than a circle in map pixels. */
export function radiusCircle(center: LatLng, radiusM: number): Feature<Polygon> {
  const radians = Math.PI / 180;
  const angularDistance = radiusM / 6371008.8;
  const latitude = center.lat * radians;
  const longitude = center.lng * radians;
  const ring: number[][] = [];
  for (let step = 0; step < 128; step++) {
    const bearing = step * 2 * Math.PI / 128;
    const lat = Math.asin(Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
    const lng = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(lat));
    ring.push([((lng / radians + 540) % 360) - 180, lat / radians]);
  }
  ring.push([...ring[0]]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function briefCenter(brief: Brief): LatLng {
  return { lat: brief.address.lat, lng: brief.address.lon };
}

export function briefLocations(brief: Brief, typeLabels: Record<string, string>): MapLocation[] {
  return [
    { id: "building", name: brief.address.address, layer: "building", location: briefCenter(brief), description: "The address you searched", distanceM: null },
    ...brief.rentsafe_nearby.buildings.map((b) => ({
      id: `rentsafe-${b.rsn}`, name: titleCase(b.address), layer: "rentsafe" as const,
      location: { lat: b.lat, lng: b.lon }, label: b.score == null ? "?" : String(Math.round(b.score)),
      description: `RentSafeTO score ${b.score ?? "unavailable"} / 100${b.scoring === "pre-2023" ? " (pre-2023 scoring)" : ""}`,
      distanceM: b.distance_m,
    })),
    ...permitLocations(brief),
    ...brief.development_applications.open.map((a) => ({
      id: `devapp-${a.application_number}`, name: titleCase(a.address), layer: "development_application" as const,
      location: { lat: a.lat, lng: a.lon }, distanceM: a.distance_m, url: a.url,
      description: [typeLabels[a.type] ?? a.type, a.status, a.description].filter(Boolean).join(" · "),
    })),
  ];
}

export type Sr311Group = {
  count: number;
  /** The three most common request types, with counts. */
  top: { type: string; count: number }[];
  latest: string;
  /** The dataset's own status strings (Completed, In Progress, New, Cancelled, …), most common first. */
  statuses: { status: string; count: number }[];
};

/** From integrate/best-of-both: the City snaps every 311 request to its nearest intersection, so identical
 *  coordinates are the data's real granularity. One circle per intersection, sized and labelled by how many
 *  requests landed there; `i` indexes `groups` for the popup. */
export function sr311Intersections(brief: Brief): { fc: FeatureCollection<Point>; groups: Sr311Group[]; total: number } {
  // Plain objects, not Map: NeighbourhoodMap imports react-map-gl's <Map> under that name.
  const by: Record<string, Brief["service_requests_311"]["nearby"]["points"]> = {};
  for (const p of brief.service_requests_311.nearby.points) {
    if (!isValidLocation({ lat: p.lat, lng: p.lon })) continue;
    (by[`${p.lon.toFixed(6)},${p.lat.toFixed(6)}`] ??= []).push(p);
  }
  const tally = (xs: string[]) => {
    const n: Record<string, number> = {};
    for (const x of xs) n[x] = (n[x] ?? 0) + 1;
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  };
  const groups: Sr311Group[] = [];
  const features: Feature<Point>[] = [];
  for (const group of Object.values(by)) {
    const count = group.length;
    groups.push({
      count,
      top: tally(group.map((p) => p.type)).slice(0, 3).map(([type, c]) => ({ type, count: c })),
      latest: group.reduce((a, p) => (p.date > a ? p.date : a), group[0].date),
      statuses: tally(group.map((p) => p.status)).map(([status, c]) => ({ status, count: c })),
    });
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [group[0].lon, group[0].lat] },
      properties: { i: groups.length - 1, count, label: count >= 3 ? String(count) : "" },
    });
  }
  return { fc: { type: "FeatureCollection", features }, groups, total: groups.reduce((n, g) => n + g.count, 0) };
}

// Essentials (integrate/best-of-both): subway, groceries, pharmacies and hospitals near the address, from a
// static OpenStreetMap extract (public/amenities-toronto.json). Pharmacies are "Rx" here because "D" already
// marks development applications on this map.
export const AMENITY_MARK: Record<Amenity["category"], string> = { subway: "T", grocery: "G", pharmacy: "Rx", hospital: "H" };

export function amenityLocations(items: Amenity[]): MapLocation[] {
  return items.map((a, i) => ({
    id: `amenity-${a.category}-${i}`, name: a.name, layer: "amenity" as const, category: a.category,
    location: { lat: a.lat, lng: a.lon }, distanceM: a.distance_m, label: AMENITY_MARK[a.category],
    description: `${AMENITY_LABELS[a.category]} · ${metres(a.distance_m)} straight-line · OpenStreetMap`,
  }));
}

// Location search: plain words match the name, layer and description; these words also find a kind of place
// whose own text may not say so ("metro" finds subway stations as well as Metro supermarkets).
const SEARCH_SYNONYMS: Record<string, string[]> = {
  grocery: ["grocery", "groceries", "supermarket", "food"],
  subway: ["transit", "subway", "metro", "ttc", "station", "train"],
  pharmacy: ["pharmacy", "drugstore", "rx"],
  hospital: ["hospital", "er", "emergency"],
  building_permit: ["permit", "permits", "construction"],
  development_application: ["development", "application", "applications"],
  rentsafe: ["rentsafeto", "rentsafe", "building", "buildings", "apartment", "apartments"],
};

/** True when every word of the query matches the location's text or one of its kind's synonyms. */
export function matchesQuery(location: MapLocation, query: string): boolean {
  const words = query.toLowerCase().replace(/drug store/g, "drugstore").split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${location.name} ${layerLabels[location.layer]} ${location.description}`.toLowerCase();
  const synonyms = SEARCH_SYNONYMS[location.category ?? location.layer] ?? [];
  // A synonym matches whole, or as a prefix once three letters are typed ("groc", "pharm").
  return words.every((w) => text.includes(w) || synonyms.some((s) => s === w || (w.length >= 3 && s.startsWith(w))));
}
