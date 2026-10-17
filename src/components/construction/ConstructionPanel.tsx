import type { NearbyChange } from "@/contracts/types";
import { SourceLink } from "@/components/ui/SourceLink";

interface ConstructionPanelProps {
  nearby: NearbyChange[];
}

export function ConstructionPanel({ nearby }: ConstructionPanelProps) {
  return (
    <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#142D4E]">Nearby construction</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
            Demo data — illustrative only
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-6">
          Permits and development applications returned for the building&apos;s 500 m surroundings.
        </p>

        {nearby.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            No active permits or development applications recorded within 500 m.
          </p>
        ) : (
          <div className="space-y-6">
            {nearby.map((item) => {
              const isPermit = item.kind === "building_permit";
              return (
                <div key={item.source} className="space-y-3 pb-5 border-b border-slate-100 last:border-b-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0D9488]">
                      {isPermit ? "Building permit" : "Development application"}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {item.distanceM} m away
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {item.description}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Status</span>
                      <span className="font-medium text-slate-700">{item.status}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">
                        {isPermit ? "Issued date" : "Submitted date"}
                      </span>
                      <span className="font-medium text-slate-700">
                        {item.date ?? "Unavailable"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Units created</span>
                      <span className="font-medium text-slate-700">
                        {item.unitsCreated ?? "Unavailable"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Community meeting</span>
                      <span className="font-medium text-slate-700">
                        {item.communityMeeting
                          ? `${item.communityMeeting.date} (${item.communityMeeting.time ?? ""})`
                          : "No meeting information provided"}
                      </span>
                    </div>
                  </div>

                  <SourceLink source={item.source} className="pt-1" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100 leading-relaxed">
        An application or issued permit does not establish an active construction schedule. Dates and statuses are shown as provided.
      </p>
    </div>
  );
}