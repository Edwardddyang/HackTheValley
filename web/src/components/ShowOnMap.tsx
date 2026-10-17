"use client";

/** A small "Map" pill on brief rows; BriefMap listens for the event and flies there. */

export type ShowOnMapDetail = {
  lon: number;
  lat: number;
  layer: "rentsafe" | "permits" | "devapps" | "amenity";
  /** When set, shown as the popup as-is instead of looking up the nearest feature's properties. */
  props?: Record<string, unknown>;
};

export const SHOW_ON_MAP_EVENT = "rentreceipts:show-on-map";

export function ShowOnMap({ lon, lat, layer, label }: ShowOnMapDetail & { label: string }) {
  return (
    <button type="button"
      className="no-print ml-2 inline-block rounded-full border border-border bg-surface px-2 py-0.5 text-xs leading-tight text-ink-2 hover:border-ink hover:text-ink"
      onClick={() => window.dispatchEvent(new CustomEvent<ShowOnMapDetail>(SHOW_ON_MAP_EVENT, { detail: { lon, lat, layer } }))}>
      Map<span className="sr-only">: show {label} on the map</span>
    </button>
  );
}
