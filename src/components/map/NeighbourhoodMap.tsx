"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AttributionControl, Layer, Marker, NavigationControl, Popup, Source } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import type { BuildingReport } from "@/contracts/types";
import MapLayerControls from "./MapLayerControls";
import { defaultLayers, isValidLocation, layerLabels, radiusCircle, reportLocations } from "./mapData";
import type { LayerId, MapLocation } from "./mapData";
import "maplibre-gl/dist/maplibre-gl.css";

// The map is created only in the browser. Controls render only inside this map.
const Map = dynamic(() => import("react-map-gl/maplibre").then((module) => module.Map), {
  ssr: false,
  loading: () => <p role="status" className="p-6 text-sm">Loading map tools…</p>,
});

// OSM Standard is approved as the temporary street provider. Browser requests
// retain their Referer and normal HTTP cache behavior; no prefetch/offline feature.
// https://operations.osmfoundation.org/policies/tiles/
const streetStyle: StyleSpecification = {
  version: 8,
  sources: {
    streets: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "streets", type: "raster", source: "streets" }],
};

type Basemap = { style: StyleSpecification | string; attribution: string };
type MapIssue = { kind: "graphics" | "resource" | "timeout"; message: string };
type Props = {
  report: BuildingReport;
  demo: boolean;
  // Supply only after provider approval, with browser-safe configuration and
  // the provider's required attribution. No imagery credentials are embedded.
  satellite?: Basemap;
  street?: Basemap;
};

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
    ? `${Math.round(location.distanceM)} m from selected building` : null;
}

export default function NeighbourhoodMap(props: Props) {
  // A different selected building resets the camera, popup and map lifecycle.
  const { query } = props.report;
  return <MapExplorer key={JSON.stringify([query.rsn, query.addressPointId, query.label, query.location?.lat, query.location?.lng])} {...props} />;
}

function MapExplorer({ report, demo, satellite, street }: Props) {
  const id = useId();
  const center = report.query.location;
  const hasCenter = isValidLocation(center);
  const locations = useMemo(() => reportLocations(report), [report]);
  const plotted = locations.filter((location) => isValidLocation(location.location));
  const available = (Object.keys(layerLabels) as LayerId[]).filter((layer) =>
    layer === "radius" ? hasCenter : plotted.some((location) => location.layer === layer));
  const [visible, setVisible] = useState({ ...defaultLayers });
  const [expanded, setExpanded] = useState(false);
  const [basemap, setBasemap] = useState<"street" | "satellite">("street");
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
  const circle = useMemo(() => isValidLocation(center) ? radiusCircle(center) : null, [center]);
  const currentBasemap = basemap === "satellite" && satellite ? satellite : street;

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
      {demo && <p className="inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">Demo data — illustrative only. All markers represent fictional records.</p>}
      {expanded && (
        <fieldset className="flex flex-wrap items-center gap-3 text-sm">
          <legend className="mb-2 font-semibold">Basemap</legend>
          <label className="flex items-center gap-2"><input type="radio" name={`${id}-basemap`} checked={basemap === "street"} onChange={() => { setBasemap("street"); retryMap(); }} className="accent-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700" />Street</label>
          <label className={`flex items-center gap-2 ${satellite ? "" : "text-slate-500"}`}><input type="radio" name={`${id}-basemap`} checked={basemap === "satellite"} disabled={!satellite} aria-describedby={`${id}-satellite-note`} onChange={() => { setBasemap("satellite"); retryMap(); }} className="accent-teal-700 focus-visible:outline-2 focus-visible:outline-teal-700" />Satellite</label>
          {!satellite && <p id={`${id}-satellite-note`} className="w-full text-xs text-slate-600">Satellite is unavailable until a licensed imagery provider is configured.</p>}
        </fieldset>
      )}
      <MapLayerControls available={available} visible={visible} onToggle={(layer) => setVisible((current) => ({ ...current, [layer]: !current[layer] }))} />
      {!hasCenter ? <p role="status" className="rounded-xl bg-slate-100 p-6 text-sm">The selected building has no valid coordinates. Its map and 500 m radius are unavailable. See the location list below.</p> : (
        <>
          {mapIssue && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{mapIssue.message}</p>
            {mapIssue.kind === "graphics" && <p className="mt-2">Enable graphics acceleration in your browser settings and relaunch the browser, or try another browser with WebGL support. The location list remains available.</p>}
            <button type="button" onClick={retryMap} className="mt-2 rounded font-medium underline focus-visible:outline-2 focus-visible:outline-teal-700">Retry map</button>
          </div>}
          <div ref={containerRef} className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${expanded ? "h-[55dvh] min-h-64 sm:h-[62dvh]" : "h-96"}`}>
            <MapBoundary key={`${attempt}-${basemap}`} onRetry={retryMap}>
              <Map
                ref={mapRef}
                {...viewState}
                onMove={(event) => setViewState(event.viewState)}
                style={{ width: "100%", height: "100%" }}
                mapStyle={currentBasemap?.style ?? streetStyle}
                minZoom={2} maxZoom={19}
                attributionControl={false}
                scrollZoom={expanded}
                onLoad={(event) => {
                  if (attempt !== activeAttempt.current) return;
                  markMapReady();
                  const map = event.target;
                  map.resize();
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
                  console.error("Block Brief map error:", event.error);
                  if (/webgl|gpu|graphics context/i.test(event.error.message)) {
                    setMapIssue({ kind: "graphics", message: "Your browser could not create the WebGL graphics context needed to display the map." });
                    return;
                  }
                  const stage = mapRef.current ? "A map resource failed to load" : "Map initialization failed";
                  setMapIssue({ kind: "resource", message: `${stage}: ${event.error.message || "Unknown browser error"}. Retry the map or use the location list below.` });
                }}
                onClick={() => setSelectedId(null)}
              >
                <NavigationControl position="top-right" showCompass />
                <AttributionControl position="bottom-right" compact={false} />
                {circle && visible.radius && <Source id="building-radius" type="geojson" data={circle}>
                  <Layer id="radius-fill" type="fill" paint={{ "fill-color": "#0D9488", "fill-opacity": 0.08 }} />
                  <Layer id="radius-outline" type="line" paint={{ "line-color": "#0D9488", "line-width": 2, "line-dasharray": [3, 2] }} />
                </Source>}
                {visiblePoints.map((location) => <Marker key={location.id} latitude={location.location.lat} longitude={location.location.lng} anchor="center">
                  <button type="button" aria-label={`${location.name}: ${layerLabels[location.layer]}${demo ? ", fictional demo data" : ""}`} onClick={(event) => { event.stopPropagation(); setSelectedId(location.id); }}
                    className={`flex items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#142D4E] ${location.layer === "building" ? "size-10 bg-[#142D4E] text-base" : location.layer === "building_permit" || location.layer === "development_application" ? "size-8 bg-amber-800 text-xs" : "size-8 bg-teal-800 text-xs"}`}>
                    <span aria-hidden="true">{location.layer === "building" ? "B" : location.layer === "building_permit" ? "P" : location.layer === "development_application" ? "D" : location.layer === "transit" ? "T" : location.layer === "library" ? "L" : "●"}</span>
                  </button>
                </Marker>)}
                {selected && <Popup latitude={selected.location.lat} longitude={selected.location.lng} onClose={() => setSelectedId(null)} closeOnClick={false} focusAfterOpen={false} offset={20} maxWidth="280px">
                  <div className="p-1 text-[#142D4E]"><p className="font-semibold">{selected.name}</p><p className="mt-1 text-xs">{layerLabels[selected.layer]}</p><p className="mt-2 text-xs leading-5">{selected.description}</p>{distanceLabel(selected) && <p className="mt-1 text-xs">{distanceLabel(selected)}</p>}{demo && <p className="mt-2 text-xs font-medium text-amber-900">Demo data — illustrative only</p>}</div>
                </Popup>}
              </Map>
            </MapBoundary>
            {!loaded && !mapIssue && <p role="status" className="pointer-events-none absolute top-3 left-3 rounded bg-white px-3 py-2 text-xs shadow-sm">Loading street map…</p>}
          </div>
          <p className="text-xs leading-5 text-slate-500">{expanded ? "Drag to pan; scroll or use the zoom controls. Keyboard: focus the map, then use arrow keys to pan and +/− to zoom." : "Drag to pan and use +/− to zoom. Expand the map to enable scroll zoom."}</p>
          <p className="text-xs text-slate-600">{currentBasemap ? currentBasemap.attribution : <><a href="https://www.openstreetmap.org/copyright" className="rounded underline focus-visible:outline-2 focus-visible:outline-teal-700">© OpenStreetMap contributors</a> · <a href="https://www.openstreetmap.org/fixthemap" className="rounded underline focus-visible:outline-2 focus-visible:outline-teal-700">Report a map issue</a></>}</p>
        </>
      )}
      <details className="rounded-xl border border-slate-200 bg-white p-4" open={expanded || undefined}>
        <summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">Map locations — accessible list ({locations.length})</summary>
        <p className="mt-3 text-xs leading-5 text-slate-500">All report locations are listed here, including hidden layers. Selecting a valid location shows it on the map.</p>
        <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto text-sm">
          {locations.map((location) => <li key={location.id} className="border-t border-slate-100 pt-3">
            <p className="font-medium">{location.name}</p><p className="mt-1 text-xs text-slate-600">{layerLabels[location.layer]} · {location.description}</p>
            {distanceLabel(location) && <p className="mt-1 text-xs text-slate-600">{distanceLabel(location)}</p>}
            {hasCenter && isValidLocation(location.location) ? <button type="button" onClick={() => focusLocation(location)} className="mt-2 rounded text-xs font-medium text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Show on map</button> : <p className="mt-1 text-xs text-slate-500">{isValidLocation(location.location) ? "Map unavailable without the selected building’s coordinates." : "Coordinates unavailable; no marker plotted."}</p>}
          </li>)}
        </ul>
        {locations.length === 1 && <p className="mt-3 text-sm text-slate-600">No nearby changes or amenities are included in this report.</p>}
      </details>
    </div>
  );

  return (
    <div className="mt-4 text-[#142D4E]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Explore the building and its surroundings.</p>
        <button ref={expandRef} type="button" onClick={() => setExpanded(true)} className="rounded-lg bg-[#142D4E] px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Expand map</button>
      </div>
      {expanded && <div aria-hidden="true" className="h-96 rounded-xl bg-slate-100" />}
      <dialog ref={dialogRef} open role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label={expanded ? undefined : "Neighbourhood map"} aria-labelledby={expanded ? `${id}-dialog-title` : undefined} onCancel={(event) => { event.preventDefault(); setExpanded(false); }} className={expanded ? "fixed inset-0 m-auto max-h-[96dvh] w-[96vw] max-w-7xl overflow-y-auto rounded-2xl border border-slate-200 bg-[#F8FAFC] p-4 text-[#142D4E] shadow-2xl backdrop:bg-slate-950/65 sm:p-6" : "relative m-0 w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-[#142D4E]"}>
        {expanded && <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id={`${id}-dialog-title`} className="text-xl font-semibold">Neighbourhood explorer</h2><p className="mt-1 text-sm text-slate-600">{report.query.label}</p></div><button ref={closeRef} type="button" onClick={() => setExpanded(false)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700">Close map</button></div>}
        {content}
      </dialog>
    </div>
  );
}
