import { Cite } from "@/components/Cite";
import type { Brief } from "@/lib/brief";
import type { Extras } from "@/lib/extras";
import { num, sentenceCase, titleCase } from "@/lib/format";

import { DashboardPanel, Facts, SourceNote, Unavailable } from "./DashboardPanel";

// Layout and rent-control wording from feature/frontend (Satwik, ogd-ola); data from bb_brief. The registration
// facts (bb_extras) and their wording come from integrate/best-of-both's BuildingSection (Ariaz).
export default function BuildingSummaryPanel({ brief, extras }: { brief: Brief; extras: Extras | null }) {
  const b = brief.building;
  const reg = extras?.registration ?? null;
  // "Now" for the heating equipment's age: the newest date the data itself carries.
  const asOf = brief.service_requests_311.period.to ?? (b.in_rentsafe ? b.latest_evaluation.date : null);
  const asOfYear = asOf ? Number(asOf.slice(0, 4)) : null;
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
          <div className="mt-5"><Facts items={[["Owner type", ownerType(b.property_type)]]} /></div>
          <h3 className="mt-6 text-sm font-semibold text-[#142D4E]">From the building&apos;s City registration</h3>
          {reg ? <Registration reg={reg} asOfYear={asOfYear} /> : (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {extras
                ? "No Apartment Building Registration record matched this building, so heating, cooling and manager details aren't shown."
                : "Heating, cooling and manager details from the City's building registration aren't available right now."}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">Registration details are filled in by landlords themselves.</p>
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

type Reg = NonNullable<Extras["registration"]>;

function Registration({ reg, asOfYear }: { reg: Reg; asOfYear: number | null }) {
  const noCooling = isNone(reg.air_conditioning_type) && reg.has_cooling_room === false;
  const rows: [string, React.ReactNode][] = [
    ["Heating", heatingText(reg, asOfYear)],
    ["Cooling", coolingText(reg)],
    ["Pets", yesNo(reg.pets_allowed, "Allowed, per the registration", "Not allowed, per the registration")],
    ["Property manager", reg.property_manager ? titleCase(reg.property_manager) : "Not listed in the registration"],
    ["Elevators", reg.elevators == null ? "Not reported" : num(reg.elevators)],
    ["Laundry room", yesNo(reg.laundry_room, "Yes", "No")],
  ];
  return (
    <>
      <dl className="mt-3 divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-slate-800">{v}<Cite cite={reg.cite} /></dd>
          </div>
        ))}
      </dl>
      {noCooling && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span aria-hidden>▲ </span>No air conditioning and no cooling room on file. Ask how units stay cool in a heat wave.
        </p>
      )}
    </>
  );
}

function ownerType(t: string | null) {
  if (!t) return "Not reported";
  const u = t.toUpperCase();
  if (u === "TCHC") return "Toronto Community Housing";
  if (u === "SOCIAL HOUSING") return "Social housing";
  return sentenceCase(t);
}

const isNone = (s: string | null) => s != null && /^(none|no)$/i.test(s.trim());

function yesNo(v: string | null, yes: string, no: string) {
  if (!v) return "Not reported";
  if (/^yes$/i.test(v.trim())) return yes;
  if (/^no$/i.test(v.trim())) return no;
  return sentenceCase(v);
}

function heatingText(r: Reg, asOfYear: number | null) {
  const type = r.heating_type ? sentenceCase(r.heating_type) : "Type not reported";
  const year = r.heating_equipment_year;
  const status = r.heating_equipment_status ? sentenceCase(r.heating_equipment_status) : null;
  if (!year) return status ? `${type}. Equipment: ${status.toLowerCase()}.` : `${type}.`;
  const age = asOfYear && asOfYear >= year ? `, about ${asOfYear - year} years ago` : "";
  return status ? `${type}. Equipment ${status.toLowerCase()} in ${year}${age}.` : `${type}. Equipment from ${year}${age}.`;
}

function coolingText(r: Reg) {
  const ac = r.air_conditioning_type;
  const acText = !ac ? "Air conditioning not reported" : isNone(ac) ? "No air conditioning" : `Air conditioning: ${sentenceCase(ac).toLowerCase()}`;
  const room = r.has_cooling_room == null ? "cooling room not reported" : r.has_cooling_room ? "has a cooling room" : "no cooling room";
  return `${acText}; ${room}.`;
}
