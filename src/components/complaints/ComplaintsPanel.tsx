import type { AreaComplaints } from "@/contracts/types";
import { SourceLink } from "@/components/ui/SourceLink";

interface ComplaintsPanelProps {
  area: AreaComplaints;
}

export function ComplaintsPanel({ area }: ComplaintsPanelProps) {
  return (
    <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#142D4E]">Area-level 311 complaints</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
            Demo data — illustrative only
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Service-request counts for a postal area and ward.
        </p>

        {/* Mandatory callout: complaints are never pinned to an address */}
        <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl mb-6 text-xs text-emerald-900 leading-relaxed">
          These area-level 311 requests are <strong>NOT</strong> complaints against the selected building. The available data does not locate individual complaints at an address.
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs mb-4">
          <div>
            <span className="text-slate-400 block mb-0.5">Postal area (FSA)</span>
            <span className="font-semibold text-slate-800">
              {area.fsa ?? "Unavailable"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block mb-0.5">Ward</span>
            <span className="font-semibold text-slate-800">
              {area.wardNumber}
            </span>
          </div>
        </div>

        <div className="text-xs text-slate-500 mb-6">
          Counting period starts: <span className="font-medium text-slate-700">{area.since}</span>
        </div>

        {/* Category breakdown */}
        <div className="space-y-5">
          {area.byCategory.map((cat) => (
            <div key={cat.category} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
              <span className="text-xs font-bold text-slate-800 capitalize block">
                {cat.category}
              </span>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Postal-area requests</span>
                  <span className="font-medium text-slate-700">
                    {cat.fsaCount ?? "Unavailable"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Ward requests</span>
                  <span className="font-bold text-[#142D4E] text-sm">
                    {cat.wardCount}
                  </span>
                </div>
              </div>

              {cat.cityMedianFsaCount !== null && (
                <div className="text-[11px] text-slate-400">
                  City median postal-area count: {cat.cityMedianFsaCount}
                </div>
              )}

              <SourceLink source={cat.source} className="pt-1" />
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100 leading-relaxed">
        Resolution information is unavailable: this dataset has no closed dates or resolution-time fields. Ward and postal-area totals cover different geographies and should not be compared directly.
      </p>
    </div>
  );
}