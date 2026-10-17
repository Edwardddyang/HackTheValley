import type { Brief } from "@/lib/brief";
import { date, metres, num, titleCase } from "@/lib/format";

import { DashboardPanel, ItemList, SourceNote, Unavailable } from "./DashboardPanel";

// Card layout from feature/frontend's NearbyConstructionPanel; applications from bb_brief
// (grouped by application number: the City lists one row per street address).
export default function DevelopmentPanel({ brief }: { brief: Brief }) {
  const d = brief.development_applications;
  const counts = d.counts ?? {};
  return (
    <DashboardPanel id="development" title="Development applications"
      subtitle={`Planning applications within ${metres(brief.address.radius_m)}: rezonings, site plans, condominiums and subdivisions. One project often has several applications.`}>
      <div className="flex flex-wrap gap-2 text-xs">
        {([["in_review", "In review"], ["approved", "Approved"], ["closed", "Closed"]] as const).map(([k, label]) => (
          <span key={k} className="rounded-full border border-slate-200 bg-[#F8FAFC] px-3 py-1 text-slate-700">
            {label}: <span className="font-semibold text-[#142D4E]">{num(counts[k] ?? 0)}</span>
          </span>
        ))}
      </div>
      {d.open.length === 0 ? <div className="mt-4"><Unavailable>No open applications in this radius.</Unavailable></div> : (
        <div className="mt-4"><ItemList items={d.open.map((a) => (
            <li key={a.application_number} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-teal-800">{d.type_labels[a.type] ?? a.type}</p>
                <p className="text-xs tabular-nums text-slate-500">{metres(a.distance_m)} away</p>
              </div>
              <h4 className="mt-3 font-semibold text-[#142D4E]">
                {titleCase(a.address)}
                {a.other_addresses?.length ? <span className="font-normal text-slate-500" title={a.other_addresses.map(titleCase).join(", ")}> + {a.other_addresses.length} more address{a.other_addresses.length === 1 ? "" : "es"}</span> : null}
              </h4>
              {a.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{a.description}</p>}
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 font-medium text-slate-700">{a.status || "Unavailable"}</dd></div>
                <div><dt className="text-xs text-slate-500">Submitted date</dt><dd className="mt-1 text-slate-700">{date(a.date_submitted)}</dd></div>
                <div><dt className="text-xs text-slate-500">Community meeting</dt><dd className="mt-1 text-slate-700">{a.community_meeting_date ? date(a.community_meeting_date) : "None recorded"}</dd></div>
              </dl>
              <SourceNote cite={a.cite} url={a.url} />
            </li>
          ))} /></div>
      )}
      {d.open.length === 20 && <p className="mt-3 text-xs text-slate-500">Showing the 20 most recent open applications.</p>}
    </DashboardPanel>
  );
}
