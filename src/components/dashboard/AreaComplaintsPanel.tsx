import type { AreaComplaints, ComplaintCategory } from "@/contracts/types";
import { DashboardPanel, formatCount, formatMonth, SourceNote, Unavailable } from "./DashboardPanel";

const categoryLabels: Record<ComplaintCategory, string> = {
  heat: "Heat", building: "Building conditions", noise: "Noise", waste: "Waste", graffiti: "Graffiti", water: "Water",
};

export default function AreaComplaintsPanel({ area, demo, loading = false }: {
  area: AreaComplaints | null;
  demo: boolean;
  loading?: boolean;
}) {
  return (
    <DashboardPanel title="Area-level 311 complaints" subtitle="Service-request counts for a postal area and ward." demo={demo} loading={loading}>
      <p className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-medium leading-6 text-teal-950">These area-level 311 requests are NOT complaints against the selected building. The available data does not locate individual complaints at an address.</p>
      {!area ? <div className="mt-4"><Unavailable>Area-level complaint information is unavailable.</Unavailable></div> : <>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-slate-500">Postal area (FSA)</dt><dd className="mt-1 font-medium text-slate-800">{area.fsa || "Unavailable"}</dd></div>
          <div><dt className="text-slate-500">Ward</dt><dd className="mt-1 font-medium text-slate-800">{formatCount(area.wardNumber)}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Counting period starts</dt><dd className="mt-1 font-medium text-slate-800">{formatMonth(area.since)}</dd></div>
        </dl>
        {area.byCategory.length ? <ul className="mt-5 space-y-4">{area.byCategory.map((item, index) => (
          <li key={`${item.category}-${index}`} className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-[#142D4E]">{categoryLabels[item.category]}</h3>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-xs text-slate-500">Postal-area requests</dt><dd className="mt-1 font-semibold tabular-nums">{formatCount(item.fsaCount)}</dd></div>
              <div><dt className="text-xs text-slate-500">Ward requests</dt><dd className="mt-1 font-semibold tabular-nums">{formatCount(item.wardCount)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-slate-500">City median postal-area count</dt><dd className="mt-1 tabular-nums">{formatCount(item.cityMedianFsaCount)}</dd></div>
            </dl>
            <SourceNote source={item.source} demo={demo} />
          </li>
        ))}</ul> : <div className="mt-4"><Unavailable>No complaint-category counts were returned for this area.</Unavailable></div>}
      </>}
      <p className="mt-4 text-xs leading-5 text-slate-500">Resolution information is unavailable: this dataset has no closed dates or resolution-time fields. Ward and postal-area totals cover different geographies and should not be compared directly.</p>
    </DashboardPanel>
  );
}
