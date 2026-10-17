import type { Feature, Polygon } from "geojson";
import type { BuildingReport, LatLng } from "@/contracts/types";

export const layerLabels = {
  building: "Building location",
  radius: "500-metre radius",
  building_permit: "Building permits",
  development_application: "Development applications",
  park: "Parks and green spaces",
  library: "Libraries",
  transit: "Transit stops",
  grocery: "Grocery stores",
  pharmacy: "Pharmacies",
  rec_centre: "Recreation centres",
} as const;
export type LayerId = keyof typeof layerLabels;
export type LayerVisibility = Record<LayerId, boolean>;
export const defaultLayers = Object.fromEntries(Object.keys(layerLabels).map((key) => [key, true])) as LayerVisibility;

export type MapLocation = {
  id: string;
  name: string;
  layer: Exclude<LayerId, "radius">;
  location: LatLng;
  description: string;
  distanceM: number | null;
};

export function isValidLocation(location: LatLng | null | undefined): location is LatLng {
  return !!location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}

/** Great-circle destinations on a mean-radius Earth, rather than a circle in map pixels. */
export function radiusCircle(center: LatLng): Feature<Polygon> {
  const radians = Math.PI / 180;
  const angularDistance = 500 / 6371008.8;
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

export function reportLocations(report: BuildingReport): MapLocation[] {
  return [
    { id: "building", name: report.building?.address ?? report.query.label, layer: "building" as const, location: report.query.location, description: "Selected building", distanceM: null },
    ...(report.nearby ?? []).map((item, index) => ({
      id: `change-${item.source}-${index}`, name: item.title, layer: item.kind, location: item.location,
      description: [item.status, item.description].filter(Boolean).join(" · "), distanceM: item.distanceM,
    })),
    ...(report.amenities ?? []).map((item, index) => ({
      id: `amenity-${item.source}-${index}`, name: item.name, layer: item.kind, location: item.location,
      description: layerLabels[item.kind], distanceM: item.distanceM,
    })),
  ];
}
