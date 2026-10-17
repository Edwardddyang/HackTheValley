import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import { num, titleCase } from "@/lib/format";

import { DashboardPanel, Facts, SourceNote, Unavailable } from "./DashboardPanel";

// Layout and rent-control wording from feature/frontend (Satwik, ogd-ola); data from bb_brief.
export default function BuildingSummaryPanel({ brief }: { brief: Brief }) {
  const b = brief.building;
  return (
    <DashboardPanel id="building" title="Building overview" subtitle="The basics about the building at this address.">
      <p className="text-lg font-semibold text-[#142D4E]">{brief.address.address}</p>
      {b.in_rentsafe ? (
        <div className="mt-5">
          <Facts items={[
            ["Building type", <>{titleCase(b.property_type)} apartment building<Cite cite={b.latest_evaluation.cite} /></>],
            ["Year built", b.year_built ?? "Unavailable"],
            ["Storeys", <span key="s" className="text-2xl font-semibold tabular-nums text-[#142D4E]">{num(b.storeys)}</span>],
            ["Units", <span key="u" className="text-2xl font-semibold tabular-nums text-[#142D4E]">{num(b.units)}</span>],
          ]} />
        </div>
      ) : (
        <div className="mt-4"><Unavailable>{b.note}</Unavailable></div>
      )}
      <div className="mt-6 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
        <h3 className="text-sm font-semibold text-[#142D4E]">Rent-control information</h3>
        <p className="mt-2 inline-block rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">Unverified</p>
        <p className="mt-3 text-sm leading-6 text-slate-600">Ontario&apos;s November 15, 2018 first-occupancy rule matters: new buildings and additions first occupied for residential use after that date can be exempt from the rent-increase guideline. Year built alone cannot establish rent-control status.</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">First-occupancy evidence is not in the City datasets used here. Confirm the occupancy history with the landlord before relying on rent-increase limits.</p>
        <a href="https://www.ontario.ca/page/residential-rent-increases" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded text-xs font-medium text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Ontario&apos;s rent-increase guidance (opens new tab)</a>
      </div>
      <SourceNote cite={brief.address.cite} label="Address" />
    </DashboardPanel>
  );
}
