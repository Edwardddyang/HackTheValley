"use client";

import { layerLabels } from "./mapData";
import type { LayerId, LayerVisibility } from "./mapData";

type Props = {
  available: LayerId[];
  visible: LayerVisibility;
  onToggle: (layer: LayerId) => void;
};

export default function MapLayerControls({ available, visible, onToggle }: Props) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <legend className="px-1 text-sm font-semibold text-[#142D4E]">Map layers</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {available.map((layer) => (
          <label key={layer} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={visible[layer]} onChange={() => onToggle(layer)}
              className="size-4 accent-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" />
            {layerLabels[layer]}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Only layers with valid locations are offered. 311 complaints are area totals and are never pinned.</p>
    </fieldset>
  );
}
