import { Cite } from "@/components/Cite";
import type { Brief, RentSafeStats } from "@/lib/brief";
import { metres, num, titleCase } from "@/lib/format";

import { DashboardPanel, SCORE_RULE, STATUS_COLOR, StatusLegend, StatusTag, Unavailable, rate } from "./DashboardPanel";

type Building = Brief["rentsafe_nearby"]["buildings"][number];

const SHOWN = 5;

export default function NearbyBuildingsPanel({ brief, stats }: { brief: Brief; stats: RentSafeStats | null }) {
  const median = stats?.median_score ?? null;
  const list = brief.rentsafe_nearby.buildings.filter((b) => b.distance_m > 0 || !brief.building.in_rentsafe);
  const rest = list.length - SHOWN;
  return (
    <DashboardPanel wide id="nearby-buildings" title="Evaluated buildings nearby"
      subtitle={`RentSafeTO apartment buildings within ${metres(brief.address.radius_m)}, nearest first. Useful for comparing options on the same block.`}>
      {list.length === 0 ? <Unavailable>No RentSafeTO-evaluated buildings in this radius.</Unavailable> : (
        <>
        {median != null && <div className="mb-4"><StatusLegend good={`At or above the city median (${median})`} fair="Up to 10 points below" poor="More than 10 below" /></div>}
        <BuildingTable buildings={list.slice(0, SHOWN)} median={median} caption="RentSafeTO scores of the nearest buildings" head />
        {rest > 0 && (
          <details className="group mt-4">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-teal-800 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-700">
              <span className="group-open:hidden">Show {rest} more building{rest === 1 ? "" : "s"}</span>
              <span className="hidden group-open:inline">Show fewer</span>
            </summary>
            <div className="mt-4"><BuildingTable buildings={list.slice(SHOWN)} median={median} caption="RentSafeTO scores of more buildings nearby" /></div>
          </details>
        )}
        </>
      )}
      <p className="mt-4 text-xs leading-5 text-slate-500">Scores are each building&apos;s latest evaluation. <a href="#overview" className="underline">What the score means</a>.</p>
    </DashboardPanel>
  );
}

/** Fixed column widths, so the collapsed rows line up with the table above them. */
function BuildingTable({ buildings, median, caption, head = false }: {
  buildings: Building[]; median: number | null; caption: string; head?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <colgroup><col className="w-1/2" /><col className="w-1/3" /><col /></colgroup>
        <thead className={head ? "bg-slate-50 text-xs text-slate-500" : "sr-only"}>
          <tr><th scope="col" className="px-4 py-3 font-medium">Address</th><th scope="col" className="px-4 py-3 font-medium">Score</th><th scope="col" className="px-4 py-3 text-right font-medium">Distance</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {buildings.map((b) => {
            // Pre-2023 scores used a different system, so they aren't rated against the median.
            const status = b.scoring === "2023+" ? rate(b.score, median, SCORE_RULE) : null;
            return (
            <tr key={b.rsn}>
              <th scope="row" className="px-4 py-3 font-medium text-slate-700">{titleCase(b.address)}<Cite cite={b.cite} /></th>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 tabular-nums font-semibold text-[#142D4E]">{num(b.score)}</span>
                  <div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${b.score ?? 0}%`, background: status ? STATUS_COLOR[status] : "#64748b" }} /></div>
                  {status && <span className="sr-only"><StatusTag status={status} label={status === "good" ? "at or above median" : status === "fair" ? "slightly below median" : "well below median"} /></span>}
                  {status && <span aria-hidden className="text-xs" style={{ color: STATUS_COLOR[status] }}>{status === "good" ? "●" : status === "fair" ? "◆" : "▲"}</span>}
                </div>
                {b.scoring === "pre-2023" && <span className="text-[11px] text-slate-500">pre-2023 scoring, not rated</span>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{metres(b.distance_m)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
