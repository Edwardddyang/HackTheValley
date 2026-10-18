import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { compactMoney, date, metres, month, num, titleCase } from "@/lib/format";
import { constructionNoise, NOISE_LEVELS_NOTE, noiseScoreLabel, type NoiseLevel } from "@/lib/noise";
import { mapRowId, permitSiteId } from "@/components/map/mapData";
import { ShowOnMap } from "@/components/map/ShowOnMap";

import { BarList, DashboardPanel, ItemList, SourceNote, Unavailable } from "./DashboardPanel";

const hasPoint = (p: { lat: number; lon: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lon);

const LEVEL_CLASS: Record<NoiseLevel, string> = {
  Low: "bg-emerald-100 text-emerald-900",
  Moderate: "bg-amber-100 text-amber-900",
  High: "bg-red-100 text-red-900",
};

/** Construction & noise level (lib/noise.ts) with the counts behind it. */
function NoiseStrip({ brief }: { brief: Brief }) {
  const n = constructionNoise(brief);
  const plus = n.major_list_capped ? "+" : "";
  const period = n.noise_period.from && n.noise_period.to ? `${month(n.noise_period.from)} – ${month(n.noise_period.to)}` : null;
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-semibold text-[#142D4E]">Construction &amp; noise</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_CLASS[n.level]}`}>{n.level}</span>
        <span className="text-xs tabular-nums text-slate-500" title={NOISE_LEVELS_NOTE}>{noiseScoreLabel(n.score)}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {num(n.major_within_250)}{n.major_within_250 ? plus : ""} major project{n.major_within_250 === 1 ? "" : "s"} within 250 m
        {" · "}{num(n.major_within_500)}{plus} within {metres(n.major_reach_m)}
        {n.nearest && <> · nearest {metres(n.nearest.distance_m)} ({n.nearest.type.replace(/ Folder \(DM\)$/, "").toLowerCase()})</>}
        <Cite cite={n.cites.major} />
      </p>
      <p className="text-sm leading-6 text-slate-700">
        {num(n.noise_complaints_within_250)} 311 noise complaint{n.noise_complaints_within_250 === 1 ? "" : "s"} within 250 m{period && ` (${period})`}
        <Cite cite={n.cites.complaints} />
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        A rough guide, not a sound measurement: every major permit within 500 m counts, new buildings and demolitions most,
        other $1M+ work less and mostly indoor work (mechanical, plumbing, small renovations) least, plus 311 noise complaints
        a little, each weighted by distance (half as much at 150 m). {NOISE_LEVELS_NOTE}.{n.major_list_capped && " The City data here lists only the 10 costliest major permits, so counts are a minimum."}
      </p>
    </div>
  );
}

// Card layout from feature/frontend's NearbyConstructionPanel; permits from bb_brief.
export default function NearbyConstructionPanel({ brief }: { brief: Brief }) {
  const c = brief.construction_nearby;
  return (
    <DashboardPanel id="construction" title="Nearby construction"
      subtitle={`Active building permits within ${metres(brief.address.radius_m)}, and the major projects among them.`}>
      <NoiseStrip brief={brief} />
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-[#142D4E]">{num(c.active_permit_count)}<Cite cite={c.cite} /></p>
          <p className="mt-1 text-sm text-slate-600">active permits</p>
        </div>
      </div>
      {c.by_type.length > 0 && <div className="mt-5"><BarList items={c.by_type.slice(0, 6).map((t) => ({ label: t.type, count: t.count }))} /></div>}

      <h3 className="mt-7 text-sm font-semibold text-[#142D4E]">Major projects</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{c.notable_definition}. The largest {c.notable.length >= 10 ? "10 " : ""}by estimated cost are listed here.</p>
      {c.notable.length === 0 ? <div className="mt-3"><Unavailable>No major projects in this radius. This does not confirm that no construction is planned.</Unavailable></div> : (
        // Map markers are one per site (mapData.ts permitSiteId); the first row at a site carries the id popups link to.
        <div className="mt-4"><ItemList items={c.notable.map((p, i) => (
            <li key={`${p.permit_num}-${p.type}-${i}`}
              id={hasPoint(p) && c.notable.findIndex((q) => hasPoint(q) && permitSiteId(q.lat, q.lon) === permitSiteId(p.lat, p.lon)) === i ? mapRowId(permitSiteId(p.lat, p.lon)) : undefined}
              className="scroll-mt-24 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-teal-800">Building permit · {p.type}</p>
                <p className="text-xs tabular-nums text-slate-500">{metres(p.distance_m)} away
                  {hasPoint(p) && <ShowOnMap id={permitSiteId(p.lat, p.lon)} label={titleCase(p.address)} />}</p>
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
