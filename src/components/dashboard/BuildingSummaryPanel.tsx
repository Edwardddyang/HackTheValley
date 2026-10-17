import type { BuildingCard } from "@/contracts/types";
import { DashboardPanel, formatCount, SourceNote, Unavailable } from "./DashboardPanel";

export default function BuildingSummaryPanel({ building, address, demo, loading = false }: {
  building: BuildingCard | null;
  address: string;
  demo: boolean;
  loading?: boolean;
}) {
  // Display the supplied flag only; first occupancy is absent from this contract.
  // Never calculate legal status from yearBuilt or implement rent-control logic here.
  const rentStatus = building?.rentControl === "likely-controlled" ? "Likely rent-controlled · unverified"
    : building?.rentControl === "likely-exempt" ? "Likely exempt · unverified" : "Unverified";
  const year = building?.yearBuilt;
  const yearBuilt = year != null && Number.isInteger(year) && year > 0 ? String(year) : "Unavailable";
  return (
    <DashboardPanel title="Building overview" subtitle="The basics about the apartment building you selected." demo={demo} loading={loading}>
      <p className="text-lg font-semibold text-[#142D4E]">{building?.address ?? address}</p>
      {building ? <>
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Building type</dt><dd className="mt-1 font-medium text-slate-800">{building.propertyType || "Unavailable"}</dd></div>
          <div><dt className="text-slate-500">Storeys</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#142D4E]">{formatCount(building.storeys)}</dd></div>
          <div><dt className="text-slate-500">Units</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#142D4E]">{formatCount(building.units)}</dd></div>
          <div><dt className="text-slate-500">Year built</dt><dd className="mt-1 font-medium text-slate-800">{yearBuilt}</dd></div>
          <div><dt className="text-slate-500">Property manager</dt><dd className="mt-1 break-words font-medium text-slate-800">{building.propertyManager || "Unavailable"}</dd></div>
        </dl>
      </> : <div className="mt-4"><Unavailable>No registered-building information is available. This address may be outside RentSafeTO coverage.</Unavailable></div>}
      <div className="mt-6 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#142D4E]">Rent-control information</h3>
        <p className="mt-2 inline-block rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">{rentStatus}</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">Ontario’s November 15, 2018 first-occupancy rule matters: new buildings and additions first occupied for residential use after that date can be exempt from the rent-increase guideline. Year built alone cannot establish rent-control status.</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">First-occupancy evidence is unavailable in this report. Confirm the applicable rules and occupancy history before relying on this flag.</p>
        <a href="https://www.ontario.ca/page/residential-rent-increases" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded text-xs font-medium text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Ontario’s rent-increase guidance (opens new tab)</a>
      </div>
      <SourceNote source={building?.source} demo={demo} />
    </DashboardPanel>
  );
}
