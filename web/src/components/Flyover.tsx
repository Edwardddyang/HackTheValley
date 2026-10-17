"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// CesiumJS never enters the bundle: the modal injects the official CDN build once and talks to
// window.Cesium. These are the few APIs the flyover touches, typed structurally.

type Cartesian3 = object;

interface CesiumCamera {
  setView(opts: { destination: Cartesian3 }): void;
  flyTo(opts: {
    destination: Cartesian3;
    orientation?: { heading: number; pitch: number; roll?: number };
    duration?: number;
    complete?: () => void;
  }): void;
  lookAt(target: Cartesian3, offset: object): void;
  lookAtTransform(transform: object): void;
}

interface CesiumViewer {
  camera: CesiumCamera;
  scene: {
    primitives: { add(p: object): void };
    postUpdate: { addEventListener(cb: () => void): void; removeEventListener(cb: () => void): void };
  };
  destroy(): void;
  isDestroyed(): boolean;
}

interface CesiumNS {
  Viewer: new (container: HTMLElement, opts: object) => CesiumViewer;
  Cartesian3: { fromDegrees(lon: number, lat: number, height: number): Cartesian3 };
  HeadingPitchRange: new (heading: number, pitch: number, range: number) => object;
  Matrix4: { IDENTITY: object };
  Math: { toRadians(deg: number): number };
  GoogleMaps: { defaultApiKey?: string };
  createGooglePhotorealistic3DTileset(options?: object): Promise<object>;
}

declare global {
  interface Window {
    Cesium?: CesiumNS;
    CESIUM_BASE_URL?: string;
  }
}

const CESIUM_BASE = "https://cesium.com/downloads/cesiumjs/releases/1.133/Build/Cesium/";

let cesiumLoad: Promise<CesiumNS> | null = null;

function loadCesium(): Promise<CesiumNS> {
  cesiumLoad ??= new Promise((resolve, reject) => {
    if (window.Cesium) return resolve(window.Cesium);
    window.CESIUM_BASE_URL = CESIUM_BASE;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${CESIUM_BASE}Widgets/widgets.css`;
    document.head.append(css);
    const script = document.createElement("script");
    script.src = `${CESIUM_BASE}Cesium.js`;
    script.async = true;
    script.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error("Cesium did not initialise")));
    script.onerror = () => {
      // Allow a retry on the next open instead of caching the failure.
      cesiumLoad = null;
      script.remove();
      reject(new Error("CesiumJS failed to load"));
    };
    document.head.append(script);
  });
  return cesiumLoad;
}

/** Only renders when a Google Maps key was set at build time. */
export function FlyoverButton({ lat, lon, address }: { lat: number; lon: number; address: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const [open, setOpen] = useState(false);
  if (!apiKey) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="absolute right-2 top-24 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur hover:border-ink sm:right-3 sm:text-[13px]">
        Flyover
      </button>
      {open && <FlyoverModal apiKey={apiKey} lat={lat} lon={lon} address={address} onClose={() => setOpen(false)} />}
    </>
  );
}

function FlyoverModal({ apiKey, lat, lon, address, onClose }: {
  apiKey: string; lat: number; lon: number; address: string; onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let viewer: CesiumViewer | null = null;
    let orbit: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const Cesium = await loadCesium();
        if (cancelled || !containerRef.current) return;
        // globe: false keeps Cesium off its default ion imagery (no ion token needed); the
        // Google tileset carries its own terrain and buildings.
        viewer = new Cesium.Viewer(containerRef.current, {
          globe: false, baseLayerPicker: false, geocoder: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, timeline: false, animation: false,
          infoBox: false, selectionIndicator: false, fullscreenButton: false,
        });
        Cesium.GoogleMaps.defaultApiKey = apiKey;
        const tileset = await Cesium.createGooglePhotorealistic3DTileset();
        if (cancelled) return;
        viewer.scene.primitives.add(tileset);
        setLoading(false);

        // Start high over the city, fly down to the address, then settle into a slow orbit.
        const camera = viewer.camera;
        camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 20_000) });
        const target = Cesium.Cartesian3.fromDegrees(lon, lat, 120);
        const pitch = Cesium.Math.toRadians(-32);
        let heading = 0;
        camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.004, 420),
          orientation: { heading, pitch, roll: 0 },
          duration: 5,
          complete: () => {
            if (cancelled || !viewer || viewer.isDestroyed()) return;
            orbit = () => {
              heading += 0.0008;
              camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, 480));
            };
            viewer.scene.postUpdate.addEventListener(orbit);
            // The orbit repositions the camera every frame, so it would swallow all input:
            // the first drag, scroll or touch hands the camera to Cesium's own controls.
            const container = containerRef.current;
            const stopOrbit = () => {
              if (orbit && viewer && !viewer.isDestroyed()) {
                viewer.scene.postUpdate.removeEventListener(orbit);
                camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                orbit = null;
              }
              for (const ev of ["pointerdown", "wheel", "touchstart"]) container?.removeEventListener(ev, stopOrbit);
            };
            for (const ev of ["pointerdown", "wheel", "touchstart"]) container?.addEventListener(ev, stopOrbit);
          },
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setLoading(false);
          setError("RentReceipts couldn't start the flyover. The Google Maps key may be invalid, over quota, or missing the Map Tiles API — or this area has no 3D coverage. The brief isn't affected.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewer && !viewer.isDestroyed()) {
        if (orbit) viewer.scene.postUpdate.removeEventListener(orbit);
        viewer.destroy();
      }
    };
  }, [apiKey, lat, lon]);

  // Portalled to <body>: the map region is position:sticky, whose stacking context would
  // otherwise paint the brief's content over this fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true"
      aria-label={`3D flyover of ${address}`} onClick={onClose}>
      <div className="relative flex h-[min(80vh,720px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">Flyover — {address}</h2>
            <p className="text-xs text-ink-2">Google Photorealistic 3D Tiles, streamed live — drag, scroll or pinch to explore. Imagery can lag reality by months.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}
            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-sm text-ink-2 hover:border-ink hover:text-ink">
            Close
          </button>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#101420]">
          <div ref={containerRef} className="absolute inset-0" />
          {loading && !error && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80" role="status">
              Loading the 3D city…
            </p>
          )}
          {error && (
            <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white/90" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
