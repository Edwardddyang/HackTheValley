import Link from "next/link";

import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { metres, num, titleCase } from "@/lib/format";

import { DashboardPanel, Unavailable } from "./DashboardPanel";

export default function NearbyBuildingsPanel({ brief }: { brief: Brief }) {
  const list = brief.rentsafe_nearby.buildings.filter((b) => b.distance_m > 0 || !brief.building.in_rentsafe);
  return (
    <DashboardPanel id="nearby-buildings" title="Evaluated buildings nearby"
      subtitle={`RentSafeTO apartment buildings within ${metres(brief.address.radius_m)}, nearest first. Useful for comparing options on the same block.`}>
      {list.length === 0 ? <Unavailable>No RentSafeTO-evaluated buildings in this radius.</Unavailable> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">RentSafeTO scores of nearby buildings</caption>
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th scope="col" className="px-4 py-3 font-medium">Address</th><th scope="col" className="px-4 py-3 font-medium">Score</th><th scope="col" className="px-4 py-3 text-right font-medium">Distance</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.slice(0, 10).map((b) => (
                <tr key={b.rsn}>
                  <th scope="row" className="px-4 py-3 font-medium text-slate-700">{titleCase(b.address)}<Cite cite={b.cite} /></th>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 tabular-nums font-semibold text-[#142D4E]">{num(b.score)}</span>
                      <div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-teal-700" style={{ width: `${b.score ?? 0}%` }} /></div>
                    </div>
                    {b.scoring === "pre-2023" && <span className="text-[11px] text-slate-500">pre-2023 scoring</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{metres(b.distance_m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.length > 10 && <p className="mt-3 text-xs text-slate-500">{list.length - 10} more are shown on the map.</p>}
      <p className="mt-4 text-xs leading-5 text-slate-500">Scores are each building&apos;s latest evaluation. <Link href="#inspection" className="underline">What the score means</Link>.</p>
    </DashboardPanel>
  );
}
