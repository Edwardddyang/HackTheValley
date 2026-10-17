"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// CesiumJS never enters the bundle: the modal injects the official CDN build once and talks to
// window.Cesium. These are the few APIs the flyover touches, typed structurally.

type Cartesian3 = object;

interface CesiumCamera {
  setView(opts: { destination: Cartesian3; orientation?: { heading: number; pitch: number; roll?: number } }): void;
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
  createGooglePhotorealistic3DTileset(options?: object): Promise<{ destroy?(): void }>;
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

const TILESET_TIMEOUT_MS = 20_000;

class TilesetTimeout extends Error {}

/** Rejects with TilesetTimeout after `ms`; a value that arrives late is handed to `onLate` to release. */
function withTimeout<T>(p: Promise<T>, ms: number, onLate: (v: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new TilesetTimeout(`no tileset after ${ms} ms`));
    }, ms);
    p.then(
      (v) => {
        if (settled) return onLate(v);
        settled = true;
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const DOWNLOAD_FAILED = "Couldn't download the 3D viewer — check the connection. The brief isn't affected.";
const TILES_SLOW = "The 3D tiles took too long to load — the connection may be slow. The brief isn't affected.";
const TILES_FAILED = "RentReceipts couldn't start the flyover. The Google Maps key may be invalid, over quota, or missing the Map Tiles API — or this area has no 3D coverage. The brief isn't affected.";

/** Only renders when a Google Maps key was set at build time. */
export function FlyoverButton({ lat, lon, address }: { lat: number; lon: number; address: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Stable, so the modal's effects don't re-run on every map re-render; focus goes back to the
  // button that opened the modal instead of falling to <body>.
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  if (!apiKey) return null;
  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen(true)}
        className="absolute right-2 top-24 rounded-lg border border-border bg-surface/95 px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur hover:border-ink sm:right-3 sm:text-[13px]">
        Flyover
      </button>
      {open && <FlyoverModal apiKey={apiKey} lat={lat} lon={lon} address={address} onClose={close} />}
    </>
  );
}

function FlyoverModal({ apiKey, lat, lon, address, onClose }: {
  apiKey: string; lat: number; lon: number; address: string; onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stopOrbitRef = useRef<(() => void) | null>(null);
  // Backdrop clicks close the modal only when the press also started (and ended) on the backdrop,
  // so a drag on the 3D view released outside the panel doesn't close it.
  const pressOnBackdrop = useRef({ down: false, up: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orbiting, setOrbiting] = useState(false);

  // Mount only: re-running this on parent re-renders would pull focus back to Close.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    // Capture phase + stopPropagation: the map's full-screen Escape handler listens in the bubble
    // phase, so Escape closes only this modal and leaves full-screen as it was.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    let viewer: CesiumViewer | null = null;
    let orbit: (() => void) | null = null;
    let cancelled = false;

    const fail = (message: string, err: unknown) => {
      console.error(err);
      if (cancelled) return;
      setLoading(false);
      setError(message);
    };

    (async () => {
      let Cesium: CesiumNS;
      try {
        // A stalled CDN download would otherwise leave the loading message up forever. A late
        // arrival is harmless: loadCesium caches it for the next open.
        Cesium = await withTimeout(loadCesium(), 30_000, () => {});
      } catch (err) {
        return fail(DOWNLOAD_FAILED, err);
      }
      try {
        if (cancelled || !containerRef.current) return;
        // globe: false keeps Cesium off its default ion imagery (no ion token needed); the
        // Google tileset carries its own terrain and buildings.
        viewer = new Cesium.Viewer(containerRef.current, {
          globe: false, baseLayerPicker: false, geocoder: false, homeButton: false,
          sceneModePicker: false, navigationHelpButton: false, timeline: false, animation: false,
          infoBox: false, selectionIndicator: false, fullscreenButton: false,
        });
        Cesium.GoogleMaps.defaultApiKey = apiKey;
        // A tileset that turns up after the timeout (or after closing) never reaches a viewer.
        const tileset = await withTimeout(Cesium.createGooglePhotorealistic3DTileset(), TILESET_TIMEOUT_MS,
          (late) => late.destroy?.());
        if (cancelled) {
          // Closed while the tileset was loading: it never reached a viewer, so release it here.
          tileset.destroy?.();
          return;
        }
        viewer.scene.primitives.add(tileset);
        setLoading(false);

        const camera = viewer.camera;
        const pitch = Cesium.Math.toRadians(-32);
        const vantage = Cesium.Cartesian3.fromDegrees(lon, lat - 0.004, 420);
        // Reduced motion: no fly-in and no orbit, just the final view; drag, scroll or pinch still work.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          camera.setView({ destination: vantage, orientation: { heading: 0, pitch, roll: 0 } });
          return;
        }

        // Start high over the city, fly down to the address, then settle into a slow orbit.
        camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 20_000) });
        const target = Cesium.Cartesian3.fromDegrees(lon, lat, 120);
        let heading = 0;
        camera.flyTo({
          destination: vantage,
          orientation: { heading, pitch, roll: 0 },
          duration: 5,
          complete: () => {
            if (cancelled || !viewer || viewer.isDestroyed()) return;
            orbit = () => {
              heading += 0.0008;
              camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, 480));
            };
            viewer.scene.postUpdate.addEventListener(orbit);
            setOrbiting(true);
            // The orbit repositions the camera every frame, so it would swallow all input:
            // the first drag, scroll or touch (or the Stop orbit button) hands the camera to
            // Cesium's own controls.
            const container = containerRef.current;
            const stopOrbit = () => {
              if (orbit && viewer && !viewer.isDestroyed()) {
                viewer.scene.postUpdate.removeEventListener(orbit);
                camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
                orbit = null;
              }
              for (const ev of ["pointerdown", "wheel", "touchstart"]) container?.removeEventListener(ev, stopOrbit);
              stopOrbitRef.current = null;
              if (!cancelled) setOrbiting(false);
            };
            stopOrbitRef.current = stopOrbit;
            for (const ev of ["pointerdown", "wheel", "touchstart"]) container?.addEventListener(ev, stopOrbit);
          },
        });
      } catch (err) {
        fail(err instanceof TilesetTimeout ? TILES_SLOW : TILES_FAILED, err);
      }
    })();

    return () => {
      cancelled = true;
      stopOrbitRef.current = null;
      if (viewer && !viewer.isDestroyed()) {
        if (orbit) viewer.scene.postUpdate.removeEventListener(orbit);
        viewer.destroy();
      }
    };
  }, [apiKey, lat, lon]);

  // Portalled to <body>: the map region is position:sticky, whose stacking context would
  // otherwise paint the brief's content over this fixed overlay. z-[70] sits above the region's
  // z-index 60 while the map is full screen.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true"
      aria-label={`3D flyover of ${address}`}
      onPointerDown={(e) => { pressOnBackdrop.current.down = e.target === e.currentTarget; }}
      onPointerUp={(e) => { pressOnBackdrop.current.up = e.target === e.currentTarget; }}
      onClick={(e) => {
        const { down, up } = pressOnBackdrop.current;
        pressOnBackdrop.current = { down: false, up: false };
        if (e.target === e.currentTarget && down && up) onClose();
      }}>
      <div className="relative flex h-[min(80vh,720px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">Flyover — {address}</h2>
            <p className="text-xs text-ink-2">Google Photorealistic 3D Tiles, streamed live — drag, scroll or pinch to explore. Imagery may be years old.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {orbiting && (
              <button type="button"
                onClick={() => {
                  stopOrbitRef.current?.();
                  // The button disappears once the orbit stops; keep keyboard focus in the dialog.
                  closeRef.current?.focus();
                }}
                className="rounded-md border border-border px-2.5 py-1 text-sm text-ink-2 hover:border-ink hover:text-ink">
                Stop orbit
              </button>
            )}
            <button ref={closeRef} type="button" onClick={onClose}
              className="rounded-md border border-border px-2.5 py-1 text-sm text-ink-2 hover:border-ink hover:text-ink">
              Close
            </button>
          </div>
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
