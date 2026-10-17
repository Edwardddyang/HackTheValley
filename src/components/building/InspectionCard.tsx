import type { BuildingCard } from "@/contracts/types";
import { SourceLink } from "@/components/ui/SourceLink";

interface InspectionCardProps {
  building: BuildingCard;
}

export function InspectionCard({ building }: InspectionCardProps) {
  const evalData = building.evaluation;

  if (!evalData) {
    return (
      <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs">
        <h2 className="text-base font-bold text-[#142D4E]">RentSafeTO inspection</h2>
        <p className="text-xs text-slate-500 mt-2">
          No recorded RentSafeTO inspection score for this building.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#142D4E]">RentSafeTO inspection</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
            Demo data — illustrative only
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          An inspection snapshot, with recorded categories and dates.
        </p>

        {/* Score & Date */}
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
              Fictional inspection score
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-[#142D4E]">
                {evalData.score}
              </span>
              <span className="text-slate-400 text-sm font-semibold">/100</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-400 block">Inspection date</span>
            <span className="text-xs font-medium text-slate-700">
              {evalData.evaluatedOn}
            </span>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="mt-3">
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-2.5 rounded-full transition-all"
              style={{ width: `${evalData.score}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            City median in this sample: {evalData.cityMedianScore}/100. A score describes a recorded inspection; it is not a guarantee of current conditions.
          </p>
        </div>

        {/* Categories */}
        <div className="mt-6 pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Inspection categories
          </h3>
          <div className="space-y-2.5">
            {evalData.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{item.label}</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {item.score}/3
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Category scale: 1 is the lowest recorded score; 3 is the highest. Overall scores are weighted and cannot be determined by summing these displayed items.
          </p>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100">
        <SourceLink source={evalData.source} />
      </div>
    </div>
  );
}