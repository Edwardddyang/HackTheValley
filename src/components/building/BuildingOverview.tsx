import type { BuildingCard } from "@/contracts/types";
import { RentControlBadge } from "./RentControlBadge";
import { SourceLink } from "@/components/ui/SourceLink";

interface BuildingOverviewProps {
  building: BuildingCard;
}

export function BuildingOverview({ building }: BuildingOverviewProps) {
  return (
    <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#142D4E]">Building overview</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
            Demo data — illustrative only
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          The basics about the apartment building you selected.
        </p>

        <h3 className="text-lg font-bold text-[#142D4E] mb-4">
          {building.address}
        </h3>

        {/* Building Attributes Grid */}
        <div className="space-y-4 text-xs">
          <div>
            <span className="text-slate-400 block mb-0.5">Building type</span>
            <span className="font-semibold text-slate-800">
              {building.propertyType || "Apartment Building"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400 block mb-0.5">Storeys</span>
              <span className="text-xl font-extrabold text-[#142D4E]">
                {building.storeys ?? "—"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Units</span>
              <span className="text-xl font-extrabold text-[#142D4E]">
                {building.units ?? "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400 block mb-0.5">Year built</span>
              <span className="font-semibold text-slate-800">
                {building.yearBuilt ?? "Unknown"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Property manager</span>
              <span className="font-semibold text-slate-800">
                {building.propertyManager ?? "Not recorded"}
              </span>
            </div>
          </div>
        </div>

        {/* Rent Control Badge Card */}
        <div className="mt-6">
          <RentControlBadge
            status={building.rentControl}
            yearBuilt={building.yearBuilt}
          />
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100">
        <SourceLink source={building.source} />
      </div>
    </div>
  );
}