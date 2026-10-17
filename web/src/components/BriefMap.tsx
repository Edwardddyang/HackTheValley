"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { FeatureCollection, Point, Polygon } from "geojson";
import { type MapLayerMouseEvent, setWorkerUrl } from "maplibre-gl";
import { useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source } from "react-map-gl/maplibre";

import type { Brief } from "@/lib/brief";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

// MapLibre locates its worker relative to its own module, which bundling breaks. The
// postinstall script copies the worker into public/ so it is served from the site root.
setWorkerUrl("/maplibre-gl-worker.mjs");

type LayerKey = "rentsafe" | "permits" | "devapps" | "sr311";

// Fixed palette slots; the map tiles are always light, so these are the light-mode steps
// (each 4.5:1+ against the white letter it carries). Buildings use ink + a score label rather
// than a fourth hue, and permits/applications carry a letter, so hue is never the only signal.
const COLORS = { sr311: "#2468b8", devapps: "#b84a17", permits: "#137a55", building: "#142d4e", ring: "#ffffff" };
const LETTER = { permits: "P", devapps: "A" } as const;

type Picked = { lon: number; lat: number; layer: LayerKey; props: Record<string, unknown> };

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
  }), [brief, lat, lon, radius_m, typeLabels]);

  const bounds = useMemo(() => {
    const c = data.ring.geometry.coordinates[0];
    const xs = c.map((p) => p[0]);
    const ys = c.map((p) => p[1]);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]] as [[number, number], [number, number]];
  }, [data.ring]);

  const interactive = (["rentsafe", "permits", "devapps", "sr311"] as LayerKey[]).filter((k) => visible[k]).map((k) => `${k}-pts`);

  function onClick(e: MapLayerMouseEvent) {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return setPicked(null);
    const [plon, plat] = f.geometry.coordinates;
    setPicked({ lon: plon, lat: plat, layer: f.layer.id.replace("-pts", "") as LayerKey, props: f.properties ?? {} });
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
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-hairline bg-surface-2 shadow-sm">
      <Map
        key={brief.address.address_point_id}
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

        <Source id="sr311" type="geojson" data={data.sr311}>
          <Layer id="sr311-pts" type="circle" layout={{ visibility: visible.sr311 ? "visible" : "none" }}
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
            </div>
          </Popup>
        )}
      </Map>

      <fieldset className="absolute left-2 top-2 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur sm:left-3 sm:top-3 sm:px-3 sm:py-2 sm:text-[13px]">
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
      </fieldset>
    </div>
  );
}
