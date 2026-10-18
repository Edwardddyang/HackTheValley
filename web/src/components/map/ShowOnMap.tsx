"use client";

// From integrate/best-of-both (ShowOnMap.tsx): a small "Map" pill on brief rows. NeighbourhoodMap listens for
// the event, scrolls to the map, flies to the record and opens its popup. Records are matched by their map
// location id (mapData.ts), so the right popup opens when several share one point. Map popups link back to the
// row by its DOM id, mapRowId(id) in mapData.ts (server panels call it, so it can't live in this client module).

import { SHOW_ON_MAP_EVENT, type ShowOnMapDetail } from "./mapData";

export function ShowOnMap({ id, label }: { id: string; label: string }) {
  return (
    <button type="button"
      onClick={() => window.dispatchEvent(new CustomEvent<ShowOnMapDetail>(SHOW_ON_MAP_EVENT, { detail: { id } }))}
      className="ml-2 inline-flex items-center rounded-full border border-slate-300 bg-white px-2 py-0.5 align-middle text-xs font-medium leading-tight text-slate-600 hover:border-[#142D4E] hover:text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
      Map<span className="sr-only">: show {label} on the map</span>
    </button>
  );
}
