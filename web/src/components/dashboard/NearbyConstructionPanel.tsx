import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { compactMoney, date, metres, num, titleCase } from "@/lib/format";

import { BarList, DashboardPanel, ShowMore, SourceNote, Unavailable } from "./DashboardPanel";

// Card layout from feature/frontend's NearbyConstructionPanel; permits from bb_brief.
export default function NearbyConstructionPanel({ brief }: { brief: Brief }) {
  const c = brief.construction_nearby;
  return (
    <DashboardPanel id="construction" title="Nearby construction"
      subtitle={`Active building permits within ${metres(brief.address.radius_m)}, and the major projects among them.`}>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-[#142D4E]">{num(c.active_permit_count)}<Cite cite={c.cite} /></p>
          <p className="mt-1 text-sm text-slate-600">active permits</p>
        </div>
      </div>
      {c.by_type.length > 0 && <div className="mt-5"><BarList items={c.by_type.slice(0, 6).map((t) => ({ label: t.type, count: t.count }))} /></div>}

      <h3 className="mt-7 text-sm font-semibold text-[#142D4E]">Major projects</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{c.notable_definition}.</p>
      {c.notable.length === 0 ? <div className="mt-3"><Unavailable>No major projects in this radius. This does not confirm that no construction is planned.</Unavailable></div> : (
        <div className="mt-4"><ShowMore noun="projects" items={c.notable.map((p) => (
            <li key={p.permit_num + p.type} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-teal-800">Building permit · {p.type}</p>
                <p className="text-xs tabular-nums text-slate-500">{metres(p.distance_m)} away</p>
              </div>
              <h4 className="mt-3 font-semibold text-[#142D4E]">{titleCase(p.address)}</h4>
              {p.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{p.description}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 font-medium text-slate-700">{p.status || "Unavailable"}</dd></div>
                <div><dt className="text-xs text-slate-500">Issued date</dt><dd className="mt-1 text-slate-700">{date(p.issued_date)}</dd></div>
                <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-1 text-slate-700">{p.est_const_cost ? compactMoney(p.est_const_cost) : "Not stated"}</dd></div>
                {p.dwelling_units_created ? <div><dt className="text-xs text-slate-500">Units created</dt><dd className="mt-1 text-slate-700">{num(p.dwelling_units_created)}</dd></div> : null}
              </dl>
              <SourceNote cite={p.cite} />
            </li>
          ))} /></div>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">An issued permit does not establish an active construction schedule. Dates and statuses are shown as the City records them.</p>
    </DashboardPanel>
  );
}
