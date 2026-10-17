import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

import type { Brief } from "@/lib/brief";
import { titleCase } from "@/lib/format";

// From feature/frontend (Satwik): layers, radius geometry and the location list, fed by bb_brief.

export type LatLng = { lat: number; lng: number };

export const layerLabels = {
  building: "This address",
  radius: "Search radius",
  rentsafe: "RentSafeTO buildings (score)",
  building_permit: "Major construction permits",
  development_application: "Open development applications",
  sr311: "311 requests at intersections",
} as const;
export type LayerId = keyof typeof layerLabels;
export type LayerVisibility = Record<LayerId, boolean>;
export const defaultLayers = Object.fromEntries(Object.keys(layerLabels).map((key) => [key, true])) as LayerVisibility;

/** Layers drawn as individual, focusable markers (311 points are a plain map layer instead). */
export type MarkerLayer = "building" | "rentsafe" | "building_permit" | "development_application";

export type MapLocation = {
  id: string;
  name: string;
  layer: MarkerLayer;
  location: LatLng;
  description: string;
  distanceM: number | null;
  label?: string; // short text drawn on the marker
  url?: string | null;
};

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
    ...brief.construction_nearby.notable.map((p, i) => ({
      id: `permit-${p.permit_num}-${i}`, name: titleCase(p.address), layer: "building_permit" as const,
      location: { lat: p.lat, lng: p.lon }, distanceM: p.distance_m,
      description: [p.type, p.status, p.description].filter(Boolean).join(" · "),
    })),
    ...brief.development_applications.open.map((a) => ({
      id: `devapp-${a.application_number}`, name: titleCase(a.address), layer: "development_application" as const,
      location: { lat: a.lat, lng: a.lon }, distanceM: a.distance_m, url: a.url,
      description: [typeLabels[a.type] ?? a.type, a.status, a.description].filter(Boolean).join(" · "),
    })),
  ];
}

export function sr311Points(brief: Brief): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: brief.service_requests_311.nearby.points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { type: p.type, status: p.status, date: p.date },
    })),
  };
}
