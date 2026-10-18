"use client";

import { InfoTip } from "@/components/InfoTip";

import { layerLabels } from "./mapData";
import type { LayerId, LayerVisibility } from "./mapData";

// From feature/frontend (Satwik). Layers with nothing to plot near the address get no checkbox.
type Props = {
  available: LayerId[];
  visible: LayerVisibility;
  counts: Partial<Record<LayerId, number>>;
  onToggle: (layer: LayerId) => void;
  /** Extra controls (3D buildings, area shading) shown under the layer checkboxes. */
  children?: React.ReactNode;
};

const SWATCH: Partial<Record<LayerId, string>> = {
  building: "bg-[#142D4E]",
  rentsafe: "bg-slate-600",
  building_permit: "bg-amber-800",
  development_application: "bg-violet-700",
  sr311: "bg-sky-600",
  amenity: "bg-emerald-800",
};

/** Notes behind an info button next to a layer's checkbox. */
const LAYER_INFO: Partial<Record<LayerId, string>> = {
  sr311: "The City records each 311 request at the nearest street intersection, not at an address, so the circles sit on "
    + "corners and are never pinned to a building. Each circle is one intersection, sized by how many requests landed there. "
    + "Requests reported by postal code have no location and aren't shown.",
};

export default function MapLayerControls({ available, visible, counts, onToggle, children }: Props) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <legend className="px-1 text-sm font-semibold text-[#142D4E]">Map layers</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {available.map((layer) => (
          <span key={layer} className="flex items-center gap-1.5">
            <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={visible[layer]} onChange={() => onToggle(layer)}
                className="size-4 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" />
              {SWATCH[layer] && <span aria-hidden className={`inline-block size-2.5 rounded-full ${SWATCH[layer]}`} />}
              {layerLabels[layer]}
              {counts[layer] != null && <span className="tabular-nums text-slate-500">({counts[layer]})</span>}
            </label>
            {LAYER_INFO[layer] && <InfoTip label={`About ${layerLabels[layer]}`}>{LAYER_INFO[layer]}</InfoTip>}
          </span>
        ))}
      </div>
      {children}
    </fieldset>
  );
}
