"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { FeatureCollection, Point, Polygon } from "geojson";
import { type MapLayerMouseEvent, setWorkerUrl } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, type MapRef, NavigationControl, Popup, ScaleControl, Source } from "react-map-gl/maplibre";

import { type Amenity, AMENITY_LABELS, AMENITY_LETTERS, fetchAmenities } from "@/lib/amenities";
import type { Brief } from "@/lib/brief";
import { metres, money, num, OFFENCE_LABELS } from "@/lib/format";

import { FlyoverButton } from "./Flyover";
import { SHOW_ON_MAP_EVENT, type ShowOnMapDetail } from "./ShowOnMap";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

// MapLibre locates its worker relative to its own module, which bundling breaks. The
// postinstall script copies the worker into public/ so it is served from the site root.
setWorkerUrl("/maplibre-gl-worker.mjs");

type LayerKey = "rentsafe" | "permits" | "devapps" | "sr311";

// Fixed palette slots; the map tiles are always light, so these are the light-mode steps
// (each 4.5:1+ against the white letter it carries). Buildings use ink + a score label rather
// than a fourth hue, and permits/applications carry a letter, so hue is never the only signal.
const COLORS = { sr311: "#2468b8", devapps: "#b84a17", permits: "#137a55", building: "#17263a", ring: "#ffffff", amenity: "#6d4aa0" };
const LETTER = { permits: "P", devapps: "A" } as const;

/** The brief section each layer's rows live in, for the popup's "See in brief" link. */
const SECTION_OF: Record<LayerKey, string> = {
  rentsafe: "nearby-buildings", permits: "construction", devapps: "development", sr311: "requests",
};

type Picked = { lon: number; lat: number; layer: LayerKey | "amenity"; props: Record<string, unknown> };

function circle(lon: number, lat: number, radiusM: number, steps = 96): Polygon {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

// Ghost towers: a block for each open application whose description states a height. Only the
// conservative "NN-storey" phrasing counts; everything else simply gets no block.
const STOREY_RE = /(\d{1,3})\s*[- ]?\s*store?y/i;
const METRES_PER_STOREY = 3;
const GHOST_SIDE_M = 22;

function square(lon: number, lat: number, sizeM: number): Polygon {
  const dLat = sizeM / 2 / 111_320;
  const dLon = sizeM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "Polygon",
    coordinates: [[
      [lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat],
      [lon - dLon, lat + dLat], [lon - dLon, lat - dLat],
    ]],
  };
}

function ghostTowers(open: Brief["development_applications"]["open"]): FeatureCollection<Polygon> {
  // One project often files several applications at the same point; keep the tallest reading.
  // (A record, not a Map: the react-map-gl Map component shadows the global in this module.)
  const tallest: Record<string, { lon: number; lat: number; storeys: number }> = {};
  for (const a of open) {
    if (a.lat == null || a.lon == null) continue;
    const storeys = Number(STOREY_RE.exec(a.description ?? "")?.[1] ?? 0);
    if (!storeys) continue;
    const key = `${a.lat.toFixed(6)},${a.lon.toFixed(6)}`;
    if ((tallest[key]?.storeys ?? 0) < storeys) tallest[key] = { lon: a.lon, lat: a.lat, storeys };
  }
  return {
    type: "FeatureCollection",
    features: Object.values(tallest).map((t) => ({
      type: "Feature",
      geometry: square(t.lon, t.lat, GHOST_SIDE_M),
      properties: { height: t.storeys * METRES_PER_STOREY },
    })),
  };
}

function points<T extends { lat: number; lon: number }>(items: T[], props: (t: T) => Record<string, unknown>) {
  return {
    type: "FeatureCollection",
    features: items
      .filter((i) => i.lat != null && i.lon != null)
      .map((i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [i.lon, i.lat] }, properties: props(i) })),
  } as FeatureCollection<Point>;
}

export default function BriefMap({ brief, typeLabels }: { brief: Brief; typeLabels: Record<string, string> }) {
  const { lat, lon, radius_m } = brief.address;
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    rentsafe: true, permits: true, devapps: true, sr311: true,
  });
  const [picked, setPicked] = useState<Picked | null>(null);
  const [hovering, setHovering] = useState(false);
  const [three, setThree] = useState(false);
  const [heat, setHeat] = useState(false);
  const [amenOn, setAmenOn] = useState(true);
  const [amen, setAmen] = useState<Amenity[] | "loading" | "error">("loading");
  const [areaOn, setAreaOn] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // After the commit, not in the change handler: an easeTo started mid-render can be
  // cancelled by react-map-gl's own camera reconciliation.
  useEffect(() => {
    mapRef.current?.easeTo({ pitch: three ? 55 : 0, duration: 700 });
  }, [three]);

  useEffect(() => {
    let gone = false;
    fetchAmenities(lat, lon).then((a) => !gone && setAmen(a)).catch(() => !gone && setAmen("error"));
    return () => { gone = true; };
  }, [lat, lon]);

  const focus = useCallback((flon: number, flat: number, layer: Picked["layer"], props: Record<string, unknown>) => {
    const map = mapRef.current;
    // The offset keeps the focused point (and its popup) clear of the legend panel.
    if (map) map.easeTo({ center: [flon, flat], zoom: Math.max(map.getZoom(), 16), duration: 600, offset: [70, 60] });
    setPicked({ lon: flon, lat: flat, layer, props });
    // On small screens the map sits above the brief and may be scrolled away.
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const data = useMemo(() => ({
    ring: { type: "Feature", geometry: circle(lon, lat, radius_m), properties: {} } as GeoJSON.Feature<Polygon>,
    // 311 points are the intersection the request was reported at, not an address; the date is
    // when it was reported (the data has no closed date).
    sr311: points(brief.service_requests_311.nearby.points, (p) => ({
      title: p.type, sub: `Reported ${p.date} at this intersection. Status: ${p.status}.`, row: p.row,
    })),
    devapps: points(brief.development_applications.open, (d) => ({
      title: typeLabels[d.type] ?? d.type,
      sub: `${d.status} · submitted ${d.date_submitted ?? "—"}`,
      address: d.address, description: d.description, url: d.url,
    })),
    permits: points(brief.construction_nearby.notable, (p) => ({
      title: p.type, sub: `${p.status} · ${p.est_const_cost ? `$${Math.round(p.est_const_cost).toLocaleString("en-CA")}` : "cost not stated"}`,
      address: p.address, description: p.description,
    })),
    rentsafe: points(brief.rentsafe_nearby.buildings, (b) => ({
      title: b.address, score: b.score == null ? "?" : String(Math.round(b.score)),
      sub: `RentSafeTO score ${b.score ?? "—"}/100 · evaluated ${b.evaluation_date ?? "—"}${b.scoring === "pre-2023" ? " (pre-2023 scoring)" : ""}`,
    })),
    home: points([{ lat, lon }], () => ({})),
    ghosts: ghostTowers(brief.development_applications.open),
  }), [brief, lat, lon, radius_m, typeLabels]);

  const bounds = useMemo(() => {
    const c = data.ring.geometry.coordinates[0];
    const xs = c.map((p) => p[0]);
    const ys = c.map((p) => p[1]);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] as [[number, number], [number, number]];
  }, [data.ring]);

  const interactive = [
    ...(["rentsafe", "permits", "devapps", "sr311"] as LayerKey[]).filter((k) => visible[k]).map((k) => `${k}-pts`),
    ...(amenOn ? ["amenity-pts"] : []),
  ];

  // "Map" buttons on brief rows dispatch this event; fly there and open the matching popup.
  useEffect(() => {
    function onShow(e: Event) {
      const { lon: flon, lat: flat, layer, props } = (e as CustomEvent<ShowOnMapDetail>).detail;
      let best: Record<string, unknown> = props ?? {};
      if (layer !== "amenity") {
        setVisible((v) => (v[layer] ? v : { ...v, [layer]: true }));
        let bestD = Infinity;
        for (const f of data[layer].features) {
          const [cx, cy] = f.geometry.coordinates;
          const d = (cx - flon) ** 2 + (cy - flat) ** 2;
          if (d < bestD) { bestD = d; best = f.properties ?? {}; }
        }
      }
      focus(flon, flat, layer, best);
    }
    window.addEventListener(SHOW_ON_MAP_EVENT, onShow);
    return () => window.removeEventListener(SHOW_ON_MAP_EVENT, onShow);
  }, [data, focus]);

  const amenData = useMemo(() => points(
    Array.isArray(amen) ? amen : [],
    (a) => ({ title: a.name, sub: `${AMENITY_LABELS[a.category]} · ${metres(a.distance_m)} away · OpenStreetMap`, letter: AMENITY_LETTERS[a.category] }),
  ), [amen]);

  // amen is sorted by distance, so the first of each category is the nearest one.
  const nearestAmen = useMemo(() => {
    if (!Array.isArray(amen)) return [];
    const have = new Set<string>();
    const out: Amenity[] = [];
    for (const a of amen) if (!have.has(a.category)) { have.add(a.category); out.push(a); }
    return out;
  }, [amen]);

  function onClick(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return setPicked(null);
    const [plon, plat] = f.geometry.coordinates;
    setPicked({ lon: plon, lat: plat, layer: f.layer.id.replace("-pts", "") as Picked["layer"], props: f.properties ?? {} });
  }

  const badge = (bg: string, letter: string) => (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white"
      style={{ background: bg, boxShadow: `0 0 0 1.5px ${COLORS.ring}` }}>
      {letter}
    </span>
  );
  const legend: { key: LayerKey; label: string; count: number; swatch: React.ReactNode }[] = [
    { key: "rentsafe", label: "RentSafeTO buildings, with score", count: brief.rentsafe_nearby.buildings.length,
      swatch: badge(COLORS.building, "") },
    { key: "permits", label: "Major construction", count: brief.construction_nearby.notable.length,
      swatch: badge(COLORS.permits, LETTER.permits) },
    { key: "devapps", label: "Open development applications", count: brief.development_applications.open.length,
      swatch: badge(COLORS.devapps, LETTER.devapps) },
    { key: "sr311", label: "311 requests, placed at intersections", count: brief.service_requests_311.nearby.points.length,
      swatch: <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.sr311 }} /> },
  ];

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-surface-2">
      <Map
        key={brief.address.address_point_id}
        ref={mapRef}
        initialViewState={{ bounds, fitBoundsOptions: { padding: 28 } }}
        mapStyle={STYLE}
        interactiveLayerIds={interactive}
        cursor={hovering ? "pointer" : "grab"}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={onClick}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />

        <Source id="ring" type="geojson" data={data.ring}>
          <Layer id="ring-fill" type="fill" paint={{ "fill-color": COLORS.sr311, "fill-opacity": 0.04 }} />
          <Layer id="ring-line" type="line" paint={{ "line-color": COLORS.building, "line-opacity": 0.45, "line-width": 1.5, "line-dasharray": [3, 2] }} />
        </Source>

        {/* The positron style's own vector source carries the OpenMapTiles "building" layer with
            render_height/render_min_height in metres. Mounted here, below the point layers, so
            markers and popups keep working on top of the extrusions. */}
        <Layer id="buildings-3d" type="fill-extrusion" source="openmaptiles" source-layer="building"
          minzoom={13} filter={["!=", ["get", "hide_3d"], true]}
          layout={{ visibility: three ? "visible" : "none" }}
          paint={{
            "fill-extrusion-color": "#d8d4c8",
            "fill-extrusion-opacity": 0.85,
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, ["get", "render_height"]],
            "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, ["get", "render_min_height"]],
          }} />
        <Source id="ghosts" type="geojson" data={data.ghosts}>
          <Layer id="ghost-towers" type="fill-extrusion"
            layout={{ visibility: three ? "visible" : "none" }}
            paint={{
              "fill-extrusion-color": COLORS.devapps,
              "fill-extrusion-opacity": 0.35,
              "fill-extrusion-height": ["get", "height"],
            }} />
        </Source>

        <Source id="amenities" type="geojson" data={amenData}>
          <Layer id="amenity-pts" type="circle" layout={{ visibility: amenOn ? "visible" : "none" }}
            paint={{ "circle-radius": 8, "circle-color": COLORS.amenity, "circle-stroke-width": 2, "circle-stroke-color": COLORS.ring }} />
          <Layer id="amenity-label" type="symbol"
            layout={{ visibility: amenOn ? "visible" : "none", "text-field": ["get", "letter"], "text-size": 10,
              "text-font": ["Noto Sans Bold"], "text-allow-overlap": true, "text-ignore-placement": true }}
            paint={{ "text-color": COLORS.ring }} />
        </Source>
        <Source id="sr311" type="geojson" data={data.sr311}>
          <Layer id="sr311-heat" type="heatmap" layout={{ visibility: visible.sr311 && heat ? "visible" : "none" }}
            paint={{
              "heatmap-weight": 1,
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, 0.6, 16, 1.4],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 12, 12, 16, 28],
              "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(36,104,184,0)", 0.25, "rgba(36,104,184,0.25)", 0.5, "rgba(36,104,184,0.5)",
                0.75, "rgba(219,116,7,0.65)", 1, "rgba(184,74,23,0.85)"],
              "heatmap-opacity": 0.8,
            }} />
          <Layer id="sr311-pts" type="circle" layout={{ visibility: visible.sr311 && !heat ? "visible" : "none" }}
            paint={{ "circle-radius": 4, "circle-color": COLORS.sr311, "circle-opacity": 0.55, "circle-stroke-width": 1, "circle-stroke-color": COLORS.ring }} />
        </Source>
        <Source id="devapps" type="geojson" data={data.devapps}>
          <Layer id="devapps-pts" type="circle" layout={{ visibility: visible.devapps ? "visible" : "none" }}
            paint={{ "circle-radius": 8, "circle-color": COLORS.devapps, "circle-stroke-width": 2, "circle-stroke-color": COLORS.ring }} />
          <Layer id="devapps-label" type="symbol"
            layout={{ visibility: visible.devapps ? "visible" : "none", "text-field": LETTER.devapps, "text-size": 10,
              "text-font": ["Noto Sans Bold"], "text-allow-overlap": true, "text-ignore-placement": true }}
            paint={{ "text-color": COLORS.ring }} />
        </Source>
        <Source id="permits" type="geojson" data={data.permits}>
          <Layer id="permits-pts" type="circle" layout={{ visibility: visible.permits ? "visible" : "none" }}
            paint={{ "circle-radius": 8, "circle-color": COLORS.permits, "circle-stroke-width": 2, "circle-stroke-color": COLORS.ring }} />
          <Layer id="permits-label" type="symbol"
            layout={{ visibility: visible.permits ? "visible" : "none", "text-field": LETTER.permits, "text-size": 10,
              "text-font": ["Noto Sans Bold"], "text-allow-overlap": true, "text-ignore-placement": true }}
            paint={{ "text-color": COLORS.ring }} />
        </Source>
        <Source id="rentsafe" type="geojson" data={data.rentsafe}>
          <Layer id="rentsafe-pts" type="circle" layout={{ visibility: visible.rentsafe ? "visible" : "none" }}
            paint={{ "circle-radius": 11, "circle-color": COLORS.building, "circle-stroke-width": 2, "circle-stroke-color": COLORS.ring }} />
          <Layer id="rentsafe-label" type="symbol"
            layout={{ visibility: visible.rentsafe ? "visible" : "none", "text-field": ["get", "score"], "text-size": 10,
              "text-font": ["Noto Sans Bold"], "text-allow-overlap": true, "text-ignore-placement": true }}
            paint={{ "text-color": COLORS.ring }} />
        </Source>
        <Source id="home" type="geojson" data={data.home}>
          <Layer id="home-halo" type="circle" paint={{ "circle-radius": 14, "circle-color": COLORS.building, "circle-opacity": 0.15 }} />
          <Layer id="home-pt" type="circle"
            paint={{ "circle-radius": 7, "circle-color": COLORS.building, "circle-stroke-width": 3, "circle-stroke-color": COLORS.ring }} />
        </Source>

        {picked && (
          <Popup longitude={picked.lon} latitude={picked.lat} anchor="bottom" offset={12} maxWidth="280px"
            onClose={() => setPicked(null)} closeOnClick={false}>
            <div className="space-y-1 pr-3 text-[13px] leading-snug">
              <div className="font-medium text-ink">{String(picked.props.title ?? "")}</div>
              {picked.props.address ? <div className="text-ink-2">{String(picked.props.address)}</div> : null}
              <div className="text-ink-2">{String(picked.props.sub ?? "")}</div>
              {picked.props.description ? (
                <p className="line-clamp-4 text-ink-2">{String(picked.props.description)}</p>
              ) : null}
              {picked.props.url ? (
                <a className="text-accent underline" href={String(picked.props.url)} target="_blank" rel="noreferrer">
                  City application page<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
              {picked.layer !== "amenity" ? (
                <a className="block text-accent underline" href={`#${SECTION_OF[picked.layer]}`}>See in brief</a>
              ) : null}
            </div>
          </Popup>
        )}
      </Map>

      <fieldset className="absolute left-2 top-2 max-h-[calc(100%-16px)] overflow-y-auto rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur sm:left-3 sm:top-3 sm:px-3 sm:py-2 sm:text-[13px]">
        <legend className="sr-only">Map layers to show</legend>
        {legend.map((l) => (
          <label key={l.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-ink-2">
            <input type="checkbox" className="accent-[var(--ink)]" checked={visible[l.key]}
              onChange={(e) => setVisible((v) => ({ ...v, [l.key]: e.target.checked }))} />
            <span className="flex w-3 justify-center">{l.swatch}</span>
            <span>{l.label}</span>
            <span className="ml-auto pl-2 tabular-nums text-ink-3">{l.count}</span>
          </label>
        ))}
        {visible.sr311 && (
          <label className="flex cursor-pointer items-center gap-2 py-0.5 pl-5 text-ink-2">
            <input type="checkbox" className="accent-[var(--ink)]" checked={heat}
              onChange={(e) => setHeat(e.target.checked)} />
            <span>as heatmap</span>
          </label>
        )}
        <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-hairline pt-1.5 text-ink-2">
          <input type="checkbox" className="accent-[var(--ink)]" checked={three}
            onChange={(e) => setThree(e.target.checked)} />
          <span className="flex w-3 justify-center">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-ink-3" style={{ background: "#d8d4c8" }} />
          </span>
          <span>3D buildings</span>
        </label>
        {three && data.ghosts.features.length > 0 && (
          <p className="flex items-center gap-2 py-0.5 text-ink-2">
            <span className="w-[13px]" aria-hidden="true" />
            <span className="flex w-3 justify-center">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: COLORS.devapps, opacity: 0.4 }} />
            </span>
            <span>Proposed/approved — height approximate</span>
            <span className="ml-auto pl-2 tabular-nums text-ink-3">{data.ghosts.features.length}</span>
          </p>
        )}
        <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-hairline pt-1.5 text-ink-2">
          <input type="checkbox" className="accent-[var(--ink)]" checked={amenOn}
            onChange={(e) => setAmenOn(e.target.checked)} />
          <span className="flex w-3 justify-center">{badge(COLORS.amenity, "")}</span>
          <span>Essentials (OpenStreetMap)</span>
          <span className="ml-auto pl-2 tabular-nums text-ink-3">{Array.isArray(amen) ? amen.length : "…"}</span>
        </label>
        {amenOn && nearestAmen.map((a) => (
          <button key={a.category} type="button"
            className="flex w-full max-w-[280px] cursor-pointer items-center gap-2 py-0.5 pl-5 text-left text-ink-2 hover:text-ink"
            onClick={() => window.dispatchEvent(new CustomEvent<ShowOnMapDetail>(SHOW_ON_MAP_EVENT, {
              detail: {
                lon: a.lon, lat: a.lat, layer: "amenity",
                props: { title: a.name, sub: `${AMENITY_LABELS[a.category]} · ${metres(a.distance_m)} away · OpenStreetMap` },
              },
            }))}>
            <span className="flex w-3 shrink-0 justify-center">{badge(COLORS.amenity, AMENITY_LETTERS[a.category])}</span>
            <span className="min-w-0 truncate">{a.name}</span>
            <span className="ml-auto shrink-0 pl-2 tabular-nums text-ink-3">{metres(a.distance_m)}</span>
          </button>
        ))}
        {amenOn && amen === "error" && (
          <p className="py-0.5 pl-5 text-ink-3">Couldn&apos;t reach OpenStreetMap.</p>
        )}
        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-ink-2">
          <input type="checkbox" className="accent-[var(--ink)]" checked={areaOn}
            onChange={(e) => setAreaOn(e.target.checked)} />
          <span className="w-3" aria-hidden="true" />
          <span>Area stats</span>
        </label>
      </fieldset>

      {areaOn && <AreaStats brief={brief} />}

      <FlyoverButton lat={lat} lon={lon} address={brief.address.address} />
    </div>
  );
}

/** Compact neighbourhood figures over the map; the full, cited versions live in the brief. */
function AreaStats({ brief }: { brief: Brief }) {
  const hood = brief.area.neighbourhood?.name ?? "This neighbourhood";
  const cv = brief.census.values ?? {};
  const census: [string, string][] = [];
  if (cv.median_rent_monthly?.value != null) census.push(["Median renter shelter cost", money(cv.median_rent_monthly.value)]);
  if (cv.renter_households?.percent != null) census.push(["Households renting", `${num(Math.round(cv.renter_households.percent * 10) / 10)}%`]);
  if (cv.median_household_income?.value != null) census.push(["Median household income", money(cv.median_household_income.value)]);
  return (
    <div className="absolute bottom-8 left-2 max-w-[280px] rounded-lg border border-border bg-surface/95 p-3 text-xs shadow-sm backdrop-blur sm:left-3">
      <h3 className="text-[13px] font-semibold text-ink">{hood}</h3>
      {brief.crime.offences.slice(0, 3).map((o) => (
        <div key={o.offence} className="flex justify-between gap-3 py-0.5">
          <span className="text-ink-2">{OFFENCE_LABELS[o.offence] ?? o.offence}</span>
          <span className="tabular-nums text-ink">
            {num(o.rate_per_100k)}<span className="text-ink-3"> · TO {num(o.city_rate_per_100k)}</span>
          </span>
        </div>
      ))}
      {census.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 py-0.5">
          <span className="text-ink-2">{label}</span>
          <span className="tabular-nums text-ink">{value}</span>
        </div>
      ))}
      <p className="mt-1 text-ink-3">Crime is per 100,000 vs all of Toronto, neighbourhood level. Sources are in the brief.</p>
    </div>
  );
}
