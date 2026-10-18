import {
  AirVent, ArrowUpDown, Briefcase, Building2, CalendarDays, DoorOpen, Heater, KeyRound, Layers, type LucideIcon, PawPrint,
  WashingMachine,
} from "lucide-react";

import { Cite } from "@/components/Cite";
import type { Brief, Cite as CiteData } from "@/lib/brief";
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
            [<Label key="t" icon={Building2}>Building type</Label>, <>{titleCase(b.property_type)} apartment building<Cite cite={b.latest_evaluation.cite} /></>],
            [<Label key="y" icon={CalendarDays}>Year built</Label>, b.year_built ?? "Unavailable"],
            [<Label key="s" icon={Layers}>Storeys</Label>, <span key="s" className="text-2xl font-semibold tabular-nums text-[#142D4E]">{num(b.storeys)}</span>],
            [<Label key="u" icon={DoorOpen}>Units</Label>, <span key="u" className="text-2xl font-semibold tabular-nums text-[#142D4E]">{num(b.units)}</span>],
          ]} />
          <div className="mt-5"><Facts items={[[<Label key="o" icon={KeyRound}>Owner type</Label>, ownerType(b.property_type)]]} /></div>
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
      <RentControl yearBuilt={b.in_rentsafe ? b.year_built : null} cite={b.in_rentsafe ? b.latest_evaluation.cite : null} />
      <SourceNote cite={brief.address.cite} label="Address" />
    </DashboardPanel>
  );
}

/**
 * Ontario's rent-increase guideline covers units first occupied for residential use on or before November 15, 2018.
 * The year built settles it for whole buildings either side of 2018; 2018 itself, and no year on record, can't.
 */
function RentControl({ yearBuilt, cite }: { yearBuilt: number | null; cite: CiteData | null }) {
  const covered = yearBuilt != null && yearBuilt <= 2017;
  const exempt = yearBuilt != null && yearBuilt >= 2019;
  const badge = covered ? "Rent-controlled" : exempt ? "Not rent-controlled" : "Unknown";
  const tone = covered ? "border-green-200 bg-green-50 text-green-900" : exempt ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-300 bg-white text-slate-700";
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#142D4E]">Rent control{cite && <Cite cite={cite} />}</h3>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{badge}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {covered ? <>Built in {yearBuilt}, before Ontario&apos;s November 2018 cutoff, so yearly increases are capped by the provincial guideline.</>
          : exempt ? <>First occupied after November 15, 2018, so increases aren&apos;t capped by the provincial guideline.</>
          : yearBuilt === 2018 ? <>Built in 2018: covered only if the unit was first occupied by November 15, 2018.</>
          : <>No year built on record, so it can&apos;t be told from the data.</>}
      </p>
      {covered && <p className="mt-1 text-xs text-slate-500">Units first rented after November 15, 2018, such as new additions, are exempt.</p>}
    </div>
  );
}

type Reg = NonNullable<Extras["registration"]>;

function Registration({ reg, asOfYear }: { reg: Reg; asOfYear: number | null }) {
  const noCooling = isNone(reg.air_conditioning_type) && reg.has_cooling_room === false;
  const rows: [string, LucideIcon, React.ReactNode][] = [
    ["Heating", Heater, heatingText(reg, asOfYear)],
    ["Cooling", AirVent, coolingText(reg)],
    ["Pets", PawPrint, yesNo(reg.pets_allowed, "Allowed, per the registration", "Not allowed, per the registration")],
    ["Property manager", Briefcase, reg.property_manager ? titleCase(reg.property_manager) : "Not listed in the registration"],
    ["Elevators", ArrowUpDown, reg.elevators == null ? "Not reported" : num(reg.elevators)],
    ["Laundry room", WashingMachine, yesNo(reg.laundry_room, "Yes", "No")],
  ];
  return (
    <>
      <dl className="mt-3 divide-y divide-slate-100 text-sm">
        {rows.map(([k, icon, v]) => (
          <div key={k} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 py-2">
            <dt className="text-slate-500"><Label icon={icon}>{k}</Label></dt>
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

/** A fact's label with its icon: small, muted, and always beside the words. */
function Label({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><Icon aria-hidden size={14} strokeWidth={2} className="shrink-0 text-slate-400" />{children}</span>;
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
