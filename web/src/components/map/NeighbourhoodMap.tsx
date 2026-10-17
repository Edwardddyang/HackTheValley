"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import dynamic from "next/dynamic";
import { Component, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AttributionControl, Layer, Marker, NavigationControl, Popup, Source } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type { FeatureCollection, Polygon } from "geojson";

import { AMENITY_CATEGORIES, AMENITY_LABELS, AMENITY_RADIUS_M, type AmenityResult, fetchAmenities } from "@/lib/amenities";
import type { Brief } from "@/lib/brief";
import { date, metres, month, num } from "@/lib/format";

import { FlyoverButton } from "./Flyover";
import { SHADE_ORDER, SHADES, shadeFill, shadeGradient } from "./hoodShades";
import type { HoodsFile, HoodValues, Shade } from "./hoodShades";
import MapLayerControls from "./MapLayerControls";
import { AMENITY_MARK, amenityLocations, briefCenter, briefLocations, defaultLayers, isValidLocation, layerLabels, radiusCircle, sr311Intersections } from "./mapData";
import type { LayerId, MapLocation } from "./mapData";

// From feature/frontend (Satwik): expandable map with layer controls and an accessible location
// list. Changes for real data: OpenFreeMap vector tiles, a radius that follows the search, RentSafeTO
// buildings labelled with their score, and 311 requests drawn as a plain layer (there can be 800), one circle per
// intersection.

const STYLE = "https://tiles.openfreemap.org/styles/positron";

// Browser only. MapLibre locates its worker relative to its own module, which bundling breaks;
// the postinstall script copies the worker into public/ and it is set here before the map loads.
const Map = dynamic(async () => {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
  return (await import("react-map-gl/maplibre")).Map;
}, {
  ssr: false,
  loading: () => <p role="status" className="p-6 text-sm">Loading map tools…</p>,
});

type MapIssue = { kind: "graphics" | "resource" | "timeout"; message: string };
type Props = { brief: Brief; typeLabels: Record<string, string> };

class MapBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <div role="alert" className="p-6 text-sm leading-6">
        <p>The interactive map could not start. WebGL may be unavailable in this browser. The location list is still available.</p>
        <button type="button" onClick={this.props.onRetry} className="mt-3 rounded font-medium text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Retry map</button>
      </div>
    );
    return this.props.children;
  }
}

function distanceLabel(location: MapLocation) {
  return location.distanceM !== null && Number.isFinite(location.distanceM) && location.distanceM >= 0
    ? `${metres(location.distanceM)} from this address` : null;
}

const MARKER_CLASS: Record<MapLocation["layer"], string> = {
  building: "size-10 bg-[#142D4E] text-base",
  rentsafe: "size-8 bg-slate-600 text-[11px]",
  building_permit: "size-8 bg-amber-800 text-xs",
  development_application: "size-8 bg-violet-700 text-xs",
  amenity: "size-7 bg-emerald-800 text-[10px]",
};
const MARKER_TEXT: Record<MapLocation["layer"], string> = { building: "B", rentsafe: "", building_permit: "P", development_application: "D", amenity: "" };

// --- From integrate/best-of-both (Ariaz): 3D buildings, ghost towers and neighbourhood shading -----------------

/** A clicked neighbourhood: public/hoods-toronto.json carries simplified City boundaries with each one's values. */
type HoodPick = { lng: number; lat: number; name: string; values: HoodValues; own: boolean };

// Ghost towers: a block for each open application whose description states a height ("NN-storey"); only that
// conservative phrasing counts. The tallest stated height wins, since one description often names several.
const STOREY_RE = /(\d{1,3})\s*[- ]?\s*store?y/gi;
const METRES_PER_STOREY = 3;
const GHOST_SIDE_M = 22;

function square(lng: number, lat: number, sizeM: number): Polygon {
  const dLat = sizeM / 2 / 111_320;
  const dLon = sizeM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { type: "Polygon", coordinates: [[
    [lng - dLon, lat - dLat], [lng + dLon, lat - dLat], [lng + dLon, lat + dLat], [lng - dLon, lat + dLat], [lng - dLon, lat - dLat],
  ]] };
}

function ghostTowers(open: Brief["development_applications"]["open"]): FeatureCollection<Polygon> {
  const tallest: Record<string, { lng: number; lat: number; storeys: number }> = {};
  for (const a of open) {
    if (a.lat == null || a.lon == null) continue;
    // Condominium plans register units in a building that is usually already approved or built.
    if (a.type === "CD") continue;
    let storeys = 0;
    for (const m of (a.description ?? "").matchAll(STOREY_RE)) storeys = Math.max(storeys, Number(m[1]));
    if (!storeys) continue;
    const key = `${a.lat.toFixed(6)},${a.lon.toFixed(6)}`;
    if ((tallest[key]?.storeys ?? 0) < storeys) tallest[key] = { lng: a.lon, lat: a.lat, storeys };
  }
  return {
    type: "FeatureCollection",
    features: Object.values(tallest).map((t) => ({
      type: "Feature", geometry: square(t.lng, t.lat, GHOST_SIDE_M), properties: { height: t.storeys * METRES_PER_STOREY },
    })),
  };
}

export default function NeighbourhoodMap(props: Props) {
  // A different address or radius resets the camera, popup and map lifecycle.
  return <MapExplorer key={`${props.brief.address.address_point_id}-${props.brief.address.radius_m}`} {...props} />;
}

function MapExplorer({ brief, typeLabels }: Props) {
  const id = useId();
  const center = briefCenter(brief);
  const hasCenter = isValidLocation(center);
  const [amen, setAmen] = useState<AmenityResult | "loading" | "error">("loading");
  const locations = useMemo(() => [
    ...briefLocations(brief, typeLabels),
    ...(typeof amen === "object" ? amenityLocations(amen.items) : []),
  ], [brief, typeLabels, amen]);
  // Items are sorted by distance, so the first of each category is its nearest; amenityLocations ids by index.
  const nearestAmen = typeof amen !== "object" ? [] : AMENITY_CATEGORIES.map((category) => {
    const i = amen.items.findIndex((a) => a.category === category);
    return { category, item: i < 0 ? null : amen.items[i], location: locations.find((l) => l.id === `amenity-${category}-${i}`) };
  });
  const ghosts = useMemo(() => ghostTowers(brief.development_applications.open), [brief]);
  const [three, setThree] = useState(false);
  const [shade, setShade] = useState<Shade>("none");
  const [hoods, setHoods] = useState<HoodsFile | "error" | null>(null);
  const [hood, setHood] = useState<HoodPick | null>(null);
  const sr311 = useMemo(() => sr311Intersections(brief), [brief]);
  const [pick311, setPick311] = useState<{ lng: number; lat: number; i: number } | null>(null);
  const [hovering, setHovering] = useState(false);
  const shadeDomain = shade !== "none" && hoods && hoods !== "error" ? hoods.domains[shade] ?? null : null;
  const plotted = locations.filter((location) => isValidLocation(location.location));
  const counts: Partial<Record<LayerId, number>> = {
    rentsafe: plotted.filter((l) => l.layer === "rentsafe").length,
    building_permit: plotted.filter((l) => l.layer === "building_permit").length,
    development_application: plotted.filter((l) => l.layer === "development_application").length,
    sr311: sr311.total,
    amenity: plotted.filter((l) => l.layer === "amenity").length,
  };
  const available = (Object.keys(layerLabels) as LayerId[]).filter((layer) =>
    layer === "radius" ? hasCenter : layer === "sr311" ? sr311.fc.features.length > 0 : plotted.some((location) => location.layer === layer));
  const [visible, setVisible] = useState({ ...defaultLayers });
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [mapIssue, setMapIssue] = useState<MapIssue | null>(null);
  const [viewState, setViewState] = useState({
    latitude: hasCenter ? center.lat : 0,
    longitude: hasCenter ? center.lng : 0,
    zoom: 14.8, bearing: 0, pitch: 0,
  });
  const mapRef = useRef<MapRef>(null);
  const readyRef = useRef(false);
  const activeAttempt = useRef(0);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialFit = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const visiblePoints = plotted.filter((location) => visible[location.layer]);
  const selected = visiblePoints.find((location) => location.id === selectedId);
  const circle = useMemo(() => (hasCenter ? radiusCircle(center, brief.address.radius_m) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center.lat, center.lng, hasCenter, brief.address.radius_m]);

  useEffect(() => {
    let gone = false;
    fetchAmenities(center.lat, center.lng).then((a) => !gone && setAmen(a)).catch(() => !gone && setAmen("error"));
    return () => { gone = true; };
  }, [center.lat, center.lng]);

  // The boundary file is ~0.5 MB, so it only loads the first time shading is turned on. Switching shading off
  // after a failure resets `hoods` to null (in the select's handler) so switching on again retries.
  useEffect(() => {
    if (shade === "none" || hoods) return;
    let gone = false;
    fetch("/hoods-toronto.json", { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => !gone && setHoods(j as HoodsFile))
      .catch(() => !gone && setHoods("error"));
    return () => { gone = true; };
  }, [shade, hoods]);

  // Tilt for 3D after the commit (an easeTo started mid-render can be cancelled by the map's own camera sync).
  useEffect(() => {
    mapRef.current?.easeTo({ pitch: three ? 55 : 0, duration: 700 });
  }, [three]);

  function onMapClick(event: MapLayerMouseEvent) {
    setSelectedId(null);
    setPick311(null);
    const f = event.features?.[0];
    if (f?.layer.id === "sr311-points" && f.geometry.type === "Point") {
      setHood(null);
      const [lng, lat] = f.geometry.coordinates;
      return setPick311({ lng, lat, i: Number(f.properties?.i) });
    }
    if (f?.layer.id !== "hoods-fill") return setHood(null);
    const p = f.properties as HoodValues & { id?: number; name?: string };
    setHood({
      lng: event.lngLat.lng, lat: event.lngLat.lat, name: p.name ?? "Neighbourhood", values: p,
      own: p.id != null && Number(p.id) === brief.area.neighbourhood?.hood_id,
    });
  }

  function retryMap() {
    activeAttempt.current += 1;
    readyRef.current = false;
    if (loadTimer.current !== null) clearTimeout(loadTimer.current);
    setMapIssue(null);
    setLoaded(false);
    setAttempt((value) => value + 1);
  }

  function markMapReady() {
    if (attempt !== activeAttempt.current) return;
    readyRef.current = true;
    if (loadTimer.current !== null) {
      clearTimeout(loadTimer.current);
      loadTimer.current = null;
    }
    setLoaded(true);
    // A successful render resolves a slow-load warning, but must not hide
    // a separate graphics or resource failure reported by the map.
    setMapIssue((current) => current?.kind === "timeout" ? null : current);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !expanded) return;
    const trigger = expandRef.current;
    const oldOverflow = document.body.style.overflow;
    // Promote the existing inline dialog to the top layer. Its map DOM and
    // WebGL context stay mounted; expanding must not restart tile requests.
    dialog.close();
    dialog.showModal();
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      dialog.close();
      dialog.show();
      document.body.style.overflow = oldOverflow;
      trigger?.focus();
    };
  }, [expanded]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resize = () => mapRef.current?.resize();
    const frame = requestAnimationFrame(resize);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [expanded, attempt]);

  useEffect(() => {
    if (!hasCenter || loaded || mapIssue || readyRef.current) return;
    const timer = setTimeout(() => {
      // Events can arrive before React commits effect cleanup. Check the live
      // readiness and attempt as well as cancelling the timer on success.
      if (readyRef.current || attempt !== activeAttempt.current) return;
      setMapIssue((current) => current ?? {
        kind: "timeout",
        message: "The street map is taking too long to load. Check your connection or use the location list.",
      });
    }, 15000);
    loadTimer.current = timer;
    return () => {
      clearTimeout(timer);
      if (loadTimer.current === timer) loadTimer.current = null;
    };
  }, [hasCenter, loaded, attempt, mapIssue]);

  function focusLocation(location: MapLocation) {
    setSelectedId(location.id);
    setVisible((current) => ({ ...current, [location.layer]: true }));
    if (isValidLocation(location.location)) {
      setViewState((current) => ({ ...current, longitude: location.location.lng, latitude: location.location.lat }));
    }
  }

  const content = (
    <div className="space-y-4">
      <MapLayerControls available={available} visible={visible} counts={counts}
        onToggle={(layer) => setVisible((current) => ({ ...current, [layer]: !current[layer] }))}>
        {visible.amenity && nearestAmen.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold text-slate-700">Nearest essentials</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700">
              {nearestAmen.map(({ category, item, location }) => {
                const mark = <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-[9px] font-bold text-white">{AMENITY_MARK[category]}</span>;
                const label = AMENITY_LABELS[category];
                return <li key={category}>
                  {item && location ? (
                    <button type="button" onClick={() => focusLocation(location)}
                      className="flex min-h-7 items-center gap-2 rounded text-left hover:text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
                      {mark}
                      <span>{item.name === label ? label : <>{label} · <span className="font-medium text-[#142D4E]">{item.name}</span></>}</span>
                      <span className="tabular-nums text-slate-500">{metres(item.distance_m)}</span>
                      <span className="sr-only">, show on the map</span>
                    </button>
                  ) : (
                    <span className="flex min-h-7 items-center gap-2 text-slate-500">{mark}{label} · none within {metres(AMENITY_RADIUS_M[category])}</span>
                  )}
                </li>;
              })}
            </ul>
            {typeof amen === "object" && amen.asof && <p className="mt-1 text-xs text-slate-500">OpenStreetMap extract, {month(amen.asof)}. Distances are straight-line.</p>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-slate-200 pt-3 text-sm text-slate-700">
          <div>
            <label className="flex min-h-8 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={three} onChange={(e) => setThree(e.target.checked)}
                className="size-4 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" />
              <span aria-hidden className="inline-block size-2.5 rounded-[2px] border border-slate-400" style={{ background: "#d8d4c8" }} />
              3D buildings
            </label>
            {three && ghosts.features.length > 0 && (
              <p className="ml-6 flex max-w-xs items-start gap-2 text-xs leading-5 text-slate-500">
                <span aria-hidden className="mt-1 inline-block size-2.5 shrink-0 rounded-[2px] bg-violet-700/40" />
                {ghosts.features.length} proposed or approved tower{ghosts.features.length === 1 ? "" : "s"}: height from the application text (storeys × 3 m); footprint illustrative.
              </p>
            )}
          </div>
          <div>
            <label className="flex min-h-8 items-center gap-2">
              Shade neighbourhoods
              <select value={shade}
                onChange={(e) => {
                  const next = e.target.value as Shade;
                  if (next === "none" && hoods === "error") setHoods(null);
                  if (next === "none") setHood(null);
                  setShade(next);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
                <option value="none">off</option>
                {SHADE_ORDER.map((m) => <option key={m} value={m}>by {SHADES[m].option}</option>)}
              </select>
            </label>
            {shade !== "none" && hoods === null && <p role="status" className="text-xs text-slate-500">Loading shading…</p>}
            {shade !== "none" && hoods === "error" && <p className="text-xs text-slate-500">The shading didn&apos;t load. Switch it off and on to retry.</p>}
            {shadeDomain && shade !== "none" && (
              <p className="flex max-w-md flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="tabular-nums">≤ {SHADES[shade].low(shadeDomain[0])}</span>
                <span aria-hidden className="inline-block h-2 w-16 rounded-sm" style={{ background: shadeGradient(shade) }} />
                <span className="tabular-nums">≥ {SHADES[shade].high(shadeDomain[1])}</span>
                <span>· {SHADES[shade].source} · click an area for its figures</span>
              </p>
            )}
            {shade !== "none" && hoods && hoods !== "error" && !shadeDomain && <p className="text-xs text-slate-500">This shading isn&apos;t in the map data yet.</p>}
          </div>
          {amen === "error" && <p className="text-xs text-slate-500">The essentials list didn&apos;t load.</p>}
          {typeof amen === "object" && amen.asof && !visible.amenity && <p className="text-xs leading-8 text-slate-500">Essentials: OpenStreetMap extract, {month(amen.asof)}. Distances are straight-line.</p>}
        </div>
      </MapLayerControls>
      {!hasCenter ? <p role="status" className="rounded-xl bg-slate-100 p-6 text-sm">This address has no valid coordinates, so the map and radius are unavailable. See the location list below.</p> : (
        <>
          {mapIssue && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{mapIssue.message}</p>
            {mapIssue.kind === "graphics" && <p className="mt-2">Enable graphics acceleration in your browser settings and relaunch the browser, or try another browser with WebGL support. The location list remains available.</p>}
            <button type="button" onClick={retryMap} className="mt-2 rounded font-medium underline focus-visible:outline-2 focus-visible:outline-teal-700">Retry map</button>
          </div>}
          <div ref={containerRef} className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${expanded ? "h-[55dvh] min-h-64 sm:h-[62dvh]" : "h-96 lg:h-[30rem] 2xl:h-[36rem]"}`}>
            <MapBoundary key={attempt} onRetry={retryMap}>
              <Map
                ref={mapRef}
                {...viewState}
                onMove={(event) => setViewState(event.viewState)}
                style={{ width: "100%", height: "100%" }}
                mapStyle={STYLE}
                minZoom={9} maxZoom={19}
                attributionControl={false}
                scrollZoom={expanded}
                interactiveLayerIds={[...(visible.sr311 ? ["sr311-points"] : []), ...(shadeDomain ? ["hoods-fill"] : [])]}
                cursor={hovering ? "pointer" : "grab"}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                onLoad={(event) => {
                  if (attempt !== activeAttempt.current) return;
                  markMapReady();
                  const map = event.target;
                  map.resize();
                  // A new map instance starts flat; match the 3D checkbox, which may already be on.
                  if (three) map.easeTo({ pitch: 55, duration: 0 });
                  if (circle && !hasInitialFit.current) {
                    const ring = circle.geometry.coordinates[0];
                    map.fitBounds([
                      [Math.min(...ring.map(([lng]) => lng)), Math.min(...ring.map(([, lat]) => lat))],
                      [Math.max(...ring.map(([lng]) => lng)), Math.max(...ring.map(([, lat]) => lat))],
                    ], { padding: 35, duration: 0 });
                    hasInitialFit.current = true;
                  }
                }}
                onIdle={(event) => {
                  // Idle is emitted after a completed render. This also covers
                  // late tile completion after the loading watchdog has fired.
                  if (event.target.loaded()) markMapReady();
                }}
                onError={(event) => {
                  if (attempt !== activeAttempt.current) return;
                  console.error("RentReceipts map error:", event.error);
                  if (/webgl|gpu|graphics context/i.test(event.error.message)) {
                    setMapIssue({ kind: "graphics", message: "Your browser could not create the WebGL graphics context needed to display the map." });
                    return;
                  }
                  const stage = mapRef.current ? "A map resource failed to load" : "Map initialization failed";
                  setMapIssue({ kind: "resource", message: `${stage}: ${event.error.message || "Unknown browser error"}. Retry the map or use the location list below.` });
                }}
                onClick={onMapClick}
              >
                <NavigationControl position="top-right" showCompass />
                <AttributionControl position="bottom-right" compact={!expanded} />
                {shadeDomain && shade !== "none" && hoods && hoods !== "error" && (
                  /* beforeId slots the tint under the style's roads and labels. */
                  <Source id="hoods" type="geojson" data={hoods.fc}>
                    <Layer id="hoods-fill" type="fill" beforeId="highway_path"
                      paint={{ "fill-color": shadeFill(shade, shadeDomain), "fill-opacity": 0.55 }} />
                    <Layer id="hoods-line" type="line" beforeId="highway_path"
                      paint={{ "line-color": "#142D4E", "line-opacity": 0.25, "line-width": 0.5 }} />
                  </Source>
                )}
                {/* The positron style's own vector source carries OpenMapTiles buildings with heights in metres.
                    Both extrusion layers sit under the first label layer so street names stay readable. */}
                <Layer id="buildings-3d" type="fill-extrusion" source="openmaptiles" source-layer="building"
                  beforeId="waterway_line_label" minzoom={13} filter={["!=", ["get", "hide_3d"], true]}
                  layout={{ visibility: three ? "visible" : "none" }}
                  paint={{
                    "fill-extrusion-color": "#d8d4c8",
                    "fill-extrusion-opacity": 0.85,
                    "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, ["get", "render_height"]],
                    "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, ["get", "render_min_height"]],
                  }} />
                <Source id="ghosts" type="geojson" data={ghosts}>
                  <Layer id="ghost-towers" type="fill-extrusion" beforeId="waterway_line_label"
                    layout={{ visibility: three ? "visible" : "none" }}
                    paint={{ "fill-extrusion-color": "#6d28d9", "fill-extrusion-opacity": 0.35, "fill-extrusion-height": ["get", "height"] }} />
                </Source>
                {circle && visible.radius && <Source id="building-radius" type="geojson" data={circle}>
                  <Layer id="radius-fill" type="fill" paint={{ "fill-color": "#0D9488", "fill-opacity": 0.08 }} />
                  <Layer id="radius-outline" type="line" paint={{ "line-color": "#0D9488", "line-width": 2, "line-dasharray": [3, 2] }} />
                </Source>}
                {visible.sr311 && <Source id="sr311" type="geojson" data={sr311.fc}>
                  <Layer id="sr311-points" type="circle"
                    paint={{
                      "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 4, 5, 8, 15, 12, 40, 15],
                      "circle-color": "#0284c7", "circle-opacity": 0.85, "circle-stroke-width": 1, "circle-stroke-color": "#ffffff",
                    }} />
                  <Layer id="sr311-count" type="symbol"
                    layout={{ "text-field": ["get", "label"], "text-size": 10, "text-font": ["Noto Sans Bold"],
                      "text-allow-overlap": true, "text-ignore-placement": true }}
                    paint={{ "text-color": "#ffffff" }} />
                </Source>}
                {visiblePoints.map((location) => <Marker key={location.id} latitude={location.location.lat} longitude={location.location.lng} anchor="center">
                  <button type="button" aria-label={`${location.name}: ${layerLabels[location.layer]}`} onClick={(event) => { event.stopPropagation(); setPick311(null); setSelectedId(location.id); }}
                    className={`flex items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#142D4E] ${MARKER_CLASS[location.layer]}`}>
                    <span aria-hidden="true">{location.label ?? MARKER_TEXT[location.layer]}</span>
                  </button>
                </Marker>)}
                {selected && <Popup latitude={selected.location.lat} longitude={selected.location.lng} onClose={() => setSelectedId(null)} closeOnClick={false} focusAfterOpen={false} offset={20} maxWidth="280px">
                  <div className="p-1 text-[#142D4E]">
                    <p className="font-semibold">{selected.name}</p>
                    <p className="mt-1 text-xs">{layerLabels[selected.layer]}</p>
                    <p className="mt-2 line-clamp-4 text-xs leading-5">{selected.description}</p>
                    {distanceLabel(selected) && <p className="mt-1 text-xs">{distanceLabel(selected)}</p>}
                    {selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-teal-800 underline">City application page</a>}
                  </div>
                </Popup>}
                {pick311 && !selected && visible.sr311 && sr311.groups[pick311.i] && (() => {
                  const g = sr311.groups[pick311.i];
                  return <Popup latitude={pick311.lat} longitude={pick311.lng} onClose={() => setPick311(null)} closeOnClick={false} focusAfterOpen={false} offset={10} maxWidth="280px">
                    <div className="p-1 text-[#142D4E]">
                      <p className="font-semibold">{g.count === 1 ? "One 311 request" : `${num(g.count)} 311 requests`} at this intersection</p>
                      <ul className="mt-1 space-y-0.5 text-xs leading-5">
                        {g.top.map((t) => <li key={t.type}>{t.type}{g.count > 1 && <span className="tabular-nums text-slate-500"> ({num(t.count)})</span>}</li>)}
                      </ul>
                      <p className="mt-1 text-xs leading-5">Most recent {date(g.latest)}.</p>
                      <p className="text-xs leading-5">Status: {g.count === 1 ? g.statuses[0].status : g.statuses.map((s) => `${num(s.count)} ${s.status}`).join(", ")}.</p>
                    </div>
                  </Popup>;
                })()}
                {hood && !selected && !pick311 && <Popup latitude={hood.lat} longitude={hood.lng} onClose={() => setHood(null)} closeOnClick={false} focusAfterOpen={false} offset={8} maxWidth="280px">
                  <div className="p-1 text-[#142D4E]">
                    <p className="font-semibold">{hood.name}</p>
                    {/* The shaded figure first, then the rest for comparison. */}
                    <ul className="mt-1 space-y-0.5 text-xs leading-5">
                      {[...(shade === "none" ? [] : [shade]), ...SHADE_ORDER.filter((m) => m !== shade)].map((m) => (
                        <li key={m} className={m === shade ? "font-semibold" : undefined}>{SHADES[m].line(hood.values)}</li>
                      ))}
                    </ul>
                    {hood.own && <p className="mt-1 text-xs text-teal-800">This is the address&apos;s neighbourhood; the Crime and Neighbourhood tabs cite its police and Census figures.</p>}
                  </div>
                </Popup>}
              </Map>
            </MapBoundary>
            <FlyoverButton lat={center.lat} lon={center.lng} address={brief.address.address} />
            {/* Hidden rather than unmounted while expanded: closing the dialog returns focus to this element. */}
            <button ref={expandRef} type="button" onClick={() => setExpanded(true)} hidden={expanded}
              className="absolute top-2.5 left-2.5 rounded-lg border border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-semibold text-[#142D4E] shadow-sm backdrop-blur hover:border-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
              Expand map
            </button>
            {!loaded && !mapIssue && <p role="status" className="pointer-events-none absolute bottom-3 left-3 rounded bg-white px-3 py-2 text-xs shadow-sm">Loading street map…</p>}
          </div>
          <p className="text-xs leading-5 text-slate-500">{expanded ? "Drag to pan; scroll or use the zoom controls. Keyboard: focus the map, then use arrow keys to pan and +/− to zoom." : "Drag to pan and use +/− to zoom. Expand the map to enable scroll zoom."}</p>
        </>
      )}
      <details className="rounded-xl border border-slate-200 bg-white p-4" open={expanded || undefined}>
        <summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">Map locations — accessible list ({locations.length})</summary>
        <p className="mt-3 text-xs leading-5 text-slate-500">All marked locations are listed here, including hidden layers. The {num(sr311.total)} 311 requests (at {num(sr311.fc.features.length)} intersections) are summarised by type in the 311 panel instead.</p>
        <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto text-sm">
          {locations.map((location) => <li key={location.id} className="border-t border-slate-100 pt-3">
            <p className="font-medium">{location.name}</p><p className="mt-1 line-clamp-2 text-xs text-slate-600">{layerLabels[location.layer]} · {location.description}</p>
            {distanceLabel(location) && <p className="mt-1 text-xs text-slate-600">{distanceLabel(location)}</p>}
            {hasCenter && isValidLocation(location.location) ? <button type="button" onClick={() => focusLocation(location)} className="mt-2 rounded text-xs font-medium text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Show on map</button> : <p className="mt-1 text-xs text-slate-500">Coordinates unavailable; no marker plotted.</p>}
          </li>)}
        </ul>
      </details>
    </div>
  );

  return (
    <div className="mt-4 text-[#142D4E]">
      {expanded && <div aria-hidden="true" className="h-96 rounded-xl bg-slate-100 lg:h-[30rem] 2xl:h-[36rem]" />}
      <dialog ref={dialogRef} open role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label={expanded ? undefined : "Neighbourhood map"} aria-labelledby={expanded ? `${id}-dialog-title` : undefined} onCancel={(event) => { event.preventDefault(); setExpanded(false); }} className={expanded ? "fixed inset-0 m-auto max-h-[96dvh] w-[96vw] max-w-7xl overflow-y-auto rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 text-[#142D4E] shadow-2xl backdrop:bg-slate-950/65 sm:p-6" : "relative m-0 w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-[#142D4E]"}>
        {expanded && <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id={`${id}-dialog-title`} className="text-xl font-semibold">Neighbourhood explorer</h2><p className="mt-1 text-sm text-slate-600">{brief.address.address}</p></div><button ref={closeRef} type="button" onClick={() => setExpanded(false)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700">Close map</button></div>}
        {content}
      </dialog>
    </div>
  );
}
