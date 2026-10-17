"use client";

import { layerLabels } from "./mapData";
import type { LayerId, LayerVisibility } from "./mapData";

// From feature/frontend (Satwik).
type Props = {
  available: LayerId[];
  visible: LayerVisibility;
  counts: Partial<Record<LayerId, number>>;
  onToggle: (layer: LayerId) => void;
};

const SWATCH: Partial<Record<LayerId, string>> = {
  building: "bg-[#142D4E]",
  rentsafe: "bg-slate-600",
  building_permit: "bg-amber-800",
  development_application: "bg-violet-700",
  sr311: "bg-sky-600",
};

export default function MapLayerControls({ available, visible, counts, onToggle }: Props) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <legend className="px-1 text-sm font-semibold text-[#142D4E]">Map layers</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {available.map((layer) => (
          <label key={layer} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={visible[layer]} onChange={() => onToggle(layer)}
              className="size-4 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" />
            {SWATCH[layer] && <span aria-hidden className={`inline-block size-2.5 rounded-full ${SWATCH[layer]}`} />}
            {layerLabels[layer]}
            {counts[layer] != null && <span className="tabular-nums text-slate-500">({counts[layer]})</span>}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Only layers with valid locations are offered. 311 requests appear only where they were reported at a street intersection; they are never pinned to a building.</p>
    </fieldset>
  );
}
