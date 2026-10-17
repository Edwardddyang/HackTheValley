import type { Brief } from "@/lib/brief";
import { date, metres, num } from "@/lib/format";

import { BarList, DashboardPanel, Unavailable } from "./DashboardPanel";

// Callout and caveats from feature/frontend's AreaComplaintsPanel; counts from bb_brief.
export default function AreaComplaintsPanel({ brief }: { brief: Brief }) {
  const s = brief.service_requests_311;
  const items = (types: typeof s.nearby.top_types) =>
    types.map((t) => ({ label: t.type, count: t.count, note: t.still_open ? `${num(t.still_open)} open` : undefined, cite: t.cite }));
  return (
    <DashboardPanel id="requests" title="311 service requests" subtitle={`Requests to the City, ${date(s.period.from)} – ${date(s.period.to)}.`} wide>
      <p className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-medium leading-6 text-teal-950">
        These 311 requests are NOT complaints against the selected building. The City records them by postal area, intersection or ward, never by building.
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-[#142D4E]">At intersections within {metres(brief.address.radius_m)}</h3>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-[#142D4E]">{num(s.nearby.count)}</p>
          <p className="mb-4 mt-1 text-xs leading-5 text-slate-500">{s.nearby.note}</p>
          {s.nearby.top_types.length ? <BarList items={items(s.nearby.top_types)} /> : <Unavailable>No requests placed at nearby intersections.</Unavailable>}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#142D4E]">Whole of Ward {s.ward.ward_number ?? "—"}</h3>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-[#142D4E]">{num(s.ward.count)}</p>
          <p className="mb-4 mt-1 text-xs leading-5 text-slate-500">Every request in the ward, any location type.</p>
          {s.ward.top_types.length ? <BarList color="#64748b" items={items(s.ward.top_types)} /> : <Unavailable>No requests recorded for this ward.</Unavailable>}
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">Resolution information is unavailable: this dataset has no closed dates or resolution-time fields. &ldquo;Open&rdquo; means the status was New or In Progress when the City published the file. Nearby and ward totals cover different areas and should not be compared directly.</p>
    </DashboardPanel>
  );
}
