import type { NearbyChange } from "@/contracts/types";
import { DashboardPanel, formatCount, formatDate, SourceNote, Unavailable } from "./DashboardPanel";

export default function NearbyConstructionPanel({ changes, demo, loading = false }: {
  changes: NearbyChange[];
  demo: boolean;
  loading?: boolean;
}) {
  return (
    <DashboardPanel title="Nearby construction" subtitle="Permits and development applications returned for the building’s 500 m surroundings." demo={demo} loading={loading}>
      {!changes.length ? <Unavailable>No nearby permits or development applications were returned. This does not confirm that no construction is planned.</Unavailable> : <ul className="space-y-4">{changes.map((change, index) => (
        <li key={`${change.source}-${index}`} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-teal-800">{change.kind === "building_permit" ? "Building permit" : "Development application"}</p><p className="text-xs tabular-nums text-slate-500">{Number.isFinite(change.distanceM) && change.distanceM >= 0 ? `${Math.round(change.distanceM)} m away` : "Distance unavailable"}</p></div>
          <h3 className="mt-3 font-semibold text-[#142D4E]">{change.title || "Project address unavailable"}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{change.description || "Project description unavailable."}</p>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 font-medium text-slate-700">{change.status || "Unavailable"}</dd></div>
            <div><dt className="text-xs text-slate-500">{change.kind === "building_permit" ? "Issued date" : "Submitted date"}</dt><dd className="mt-1 text-slate-700">{formatDate(change.date)}</dd></div>
            <div><dt className="text-xs text-slate-500">Units created</dt><dd className="mt-1 text-slate-700">{formatCount(change.unitsCreated)}</dd></div>
            <div><dt className="text-xs text-slate-500">Community meeting</dt><dd className="mt-1 text-slate-700">{change.communityMeeting ? <>{formatDate(change.communityMeeting.date)}{change.communityMeeting.time && ` · ${change.communityMeeting.time}`}{change.communityMeeting.location && <span className="block">{change.communityMeeting.location}</span>}</> : "No meeting information provided"}</dd></div>
          </dl>
          <SourceNote source={change.source} demo={demo} url={change.url} />
        </li>
      ))}</ul>}
      <p className="mt-4 text-xs leading-5 text-slate-500">An application or issued permit does not establish an active construction schedule. Dates and statuses are shown as provided.</p>
    </DashboardPanel>
  );
}
