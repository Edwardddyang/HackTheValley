import Link from "next/link";
import type { ReactNode } from "react";

import type { Brief, Cite as CiteData } from "@/lib/brief";
import type { Extras } from "@/lib/extras";
import { date, month, num, sentenceCase, titleCase } from "@/lib/format";

import { Cite } from "./Cite";
import { LevelBadge, ScoreRuler, scoreLevel } from "./ScoreRuler";
import { Note, Pill, Section } from "./ui";

/**
 * Median of the latest RentSafeTO score per building, 2023+ scoring, city-wide (computed from the
 * 2023-current evaluations file). bb_brief returns the percentile but not the median itself.
 */
export const RENTSAFE_CITY_MEDIAN = 92;

type Registration = NonNullable<Extras["registration"]>;

/** The building: RentSafeTO score against the city, weakest items, history, rent control and registration facts. */
export function BuildingSection({ brief, extras, asOfYear }: { brief: Brief; extras: Extras | null; asOfYear: number | null }) {
  const b = brief.building;
  if (!b.in_rentsafe) {
    return (
      <Section id="building" title="The building">
        <div className="rounded-lg border border-border bg-surface p-5">
          <p className="font-semibold text-ink">This address isn&apos;t in RentSafeTO, so there&apos;s no City inspection score.</p>
          <p className="mt-2 max-w-[64ch] text-[15px] text-ink-2">
            {b.note} Condos, houses, basement apartments and smaller buildings aren&apos;t covered. Ask the landlord who
            handles repairs and whether the unit is legally registered. The sections below about the area still apply.
          </p>
        </div>
      </Section>
    );
  }

  const e = b.latest_evaluation;
  const newScoring = e.item_scale_max === 3; // 2023+ evaluations grade items 1-3; older ones used 1-5
  const reg = extras?.registration ?? null;

  return (
    <Section id="building" title="The building"
      subtitle="RentSafeTO is the City's inspection of apartment buildings: common areas, the exterior and maintenance records, scored 0 to 100. It doesn't look inside units.">
      {e.score == null ? (
        <p className="rounded-md bg-surface-2 px-4 py-3 text-[15px]">This building is in RentSafeTO but its latest evaluation has no score.</p>
      ) : (
        <div>
          <p className="text-[15px] text-ink-2">Latest evaluation, {date(e.date)}</p>
          <p className="plate num mt-1 text-[3rem] font-bold text-ink sm:text-[3.4rem]">
            {num(e.score)}<span className="text-[1.6rem] font-normal text-ink-2"> / 100</span>
            <Cite cite={e.cite} />
          </p>
          {newScoring ? (
            <>
              <p className="mt-1 max-w-[60ch] text-[15px] text-ink">
                The city median is {RENTSAFE_CITY_MEDIAN}
                {e.percent_of_buildings_scoring_lower != null
                  ? `, and ${num(e.percent_of_buildings_scoring_lower)}% of evaluated buildings score lower (comparing each building's latest evaluation).`
                  : "."}
              </p>
              <div className="mt-3">
                <LevelBadge level={scoreLevel(e.score, RENTSAFE_CITY_MEDIAN)} />
              </div>
              <ScoreRuler score={e.score} median={RENTSAFE_CITY_MEDIAN} />
            </>
          ) : (
            <p className="mt-1 max-w-[60ch] text-[15px] text-ink-2">
              This evaluation used the scoring before 2023, so it can&apos;t be compared with the current city median.
            </p>
          )}
        </div>
      )}

      {e.lowest_items?.length ? (
        <div className="mt-2">
          <h3 className="plate text-[1.35rem] font-bold text-ink">Lowest-scoring items</h3>
          <p className="mt-1 max-w-[64ch] text-[15px] text-ink-2">
            Inspectors grade each item from 1 (worst) to {e.item_scale_max} (best). These are the lowest in this evaluation.
          </p>
          <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {e.lowest_items.map((it) => (
              <li key={it.item} className="flex items-center justify-between gap-3 border-b border-hairline py-2 text-[15px]">
                <span className="text-ink">{titleCase(it.item)}</span>
                <ItemScore score={it.score} max={e.item_scale_max} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {b.history.length > 1 && (
        <div className="mt-6">
          <h3 className="plate text-[1.35rem] font-bold text-ink">Evaluation history</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {b.history.map((h, i) => (
              <li key={i}>
                <Pill>
                  {month(h.date)}: <span className="num ml-1 font-semibold text-ink">{num(h.score)}</span>
                  <Cite cite={h.cite} />
                </Pill>
              </li>
            ))}
          </ul>
          <Note>Evaluations before 2023 used a different scoring system, so older scores aren&apos;t directly comparable.</Note>
        </div>
      )}

      <RentControlNote yearBuilt={b.year_built} cite={e.cite} />

      <h3 className="plate mt-8 text-[1.35rem] font-bold text-ink">Building facts</h3>
      <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
        <Fact term="Year built" cite={e.cite}>{b.year_built ?? "Not reported"}</Fact>
        <Fact term="Size" cite={e.cite}>
          {[b.storeys ? `${num(b.storeys)} storeys` : null, b.units ? `${num(b.units)} units` : null].filter(Boolean).join(", ") || "Not reported"}
        </Fact>
        <Fact term="Owner type" cite={e.cite}>{ownerType(b.property_type)}</Fact>
        {reg ? <RegistrationFacts reg={reg} asOfYear={asOfYear} /> : null}
      </dl>
      {!reg && (
        <Note>
          {extras
            ? "No Apartment Building Registration record matched this building, so heating, cooling and manager details aren't shown."
            : "Heating, cooling and manager details from the City's building registration aren't available right now."}
        </Note>
      )}
      <Note>
        Building facts come from RentSafeTO and the Apartment Building Registration, which landlords fill in themselves.{" "}
        <Link href="/sources#apartment_registrations" className="text-accent underline underline-offset-2">About this data</Link>
      </Note>
    </Section>
  );
}

function RegistrationFacts({ reg, asOfYear }: { reg: Registration; asOfYear: number | null }) {
  const noCooling = isNone(reg.air_conditioning_type) && reg.has_cooling_room === false;
  return (
    <>
      <Fact term="Heating" cite={reg.cite}>{heatingText(reg, asOfYear)}</Fact>
      <Fact term="Cooling" cite={reg.cite}
        flag={noCooling ? "No air conditioning and no cooling room on file. Ask how units stay cool in a heat wave." : null}>
        {coolingText(reg)}
      </Fact>
      <Fact term="Pets" cite={reg.cite}>{yesNo(reg.pets_allowed, "Allowed, per the registration", "Not allowed, per the registration")}</Fact>
      <Fact term="Property manager" cite={reg.cite}>{reg.property_manager ? titleCase(reg.property_manager) : "Not listed in the registration"}</Fact>
      <Fact term="Elevators" cite={reg.cite}>{reg.elevators == null ? "Not reported" : num(reg.elevators)}</Fact>
      <Fact term="Laundry room" cite={reg.cite}>{yesNo(reg.laundry_room, "Yes", "No")}</Fact>
    </>
  );
}

/** Cells filled up to the score plus the number in words, so the grade reads without colour. */
function ItemScore({ score, max }: { score: number; max: number }) {
  const color = score <= 1 ? "var(--brick)" : score >= max ? "var(--moss)" : "var(--amber)";
  return (
    <span className="flex shrink-0 items-center gap-2 text-sm text-ink-2">
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className="h-3 w-3 rounded-[2px] border"
            style={{ borderColor: color, backgroundColor: i < score ? color : "transparent" }} />
        ))}
      </span>
      <span className="num">{score} of {max}</span>
    </span>
  );
}

/** Ontario exempts units first occupied after Nov 15, 2018 from the rent-increase guideline; year built is only a proxy. */
function RentControlNote({ yearBuilt, cite }: { yearBuilt: number | null; cite: CiteData }) {
  const c =
    yearBuilt != null && yearBuilt <= 2017
      ? {
          title: "Likely rent-controlled",
          body: `Built in ${yearBuilt}, so yearly increases for sitting tenants are likely capped by Ontario's rent-increase guideline. This is an estimate from the year built: confirm with the landlord.`,
        }
      : yearBuilt != null && yearBuilt >= 2019
        ? {
            title: "Likely exempt from rent control",
            body: `Built in ${yearBuilt}. Units first occupied after November 15, 2018 are generally exempt from Ontario's rent-increase guideline, so increases may not be capped. Confirm with the landlord before you sign.`,
          }
        : {
            title: "Rent control: can't tell",
            body: yearBuilt === 2018
              ? "Built in 2018, the year the rule changed, so it depends on when units were first occupied. Ask the landlord whether the unit is covered by the rent-increase guideline."
              : "The year built isn't on file. Ask the landlord whether the unit is covered by Ontario's rent-increase guideline.",
          };
  return (
    <div className="mt-8 rounded-lg border-2 border-ink bg-surface p-4 sm:p-5">
      <h3 className="plate text-[1.35rem] font-bold text-ink">
        {c.title}
        {yearBuilt != null ? <Cite cite={cite} /> : null}
      </h3>
      <p className="mt-1 max-w-[62ch] text-[15px] text-ink">{c.body}</p>
    </div>
  );
}

function Fact({ term, cite, flag, children }: { term: string; cite?: CiteData | null; flag?: string | null; children: ReactNode }) {
  return (
    <div className="border-t border-hairline py-2.5">
      <dt className="text-sm text-ink-2">{term}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold text-ink">
        {children}
        {cite ? <Cite cite={cite} /> : null}
      </dd>
      {flag && (
        <dd className="mt-2 flex gap-2 rounded-md bg-amber-tint px-3 py-2 text-sm text-ink">
          <span aria-hidden="true" className="font-bold text-amber">!</span>
          <span><span className="sr-only">Worth asking: </span>{flag}</span>
        </dd>
      )}
    </div>
  );
}

const isNone = (s: string | null) => s != null && /^(none|no)$/i.test(s.trim());

function yesNo(v: string | null, yes: string, no: string) {
  if (!v) return "Not reported";
  if (/^yes$/i.test(v.trim())) return yes;
  if (/^no$/i.test(v.trim())) return no;
  return sentenceCase(v);
}

function heatingText(r: Registration, asOfYear: number | null) {
  const type = r.heating_type ? sentenceCase(r.heating_type) : "Type not reported";
  const year = r.heating_equipment_year;
  const status = r.heating_equipment_status ? sentenceCase(r.heating_equipment_status) : null;
  if (!year) return status ? `${type}. Equipment: ${status.toLowerCase()}.` : `${type}.`;
  const age = asOfYear && asOfYear >= year ? `, about ${asOfYear - year} years ago` : "";
  return status ? `${type}. Equipment ${status.toLowerCase()} in ${year}${age}.` : `${type}. Equipment from ${year}${age}.`;
}

function coolingText(r: Registration) {
  const ac = r.air_conditioning_type;
  const acText = !ac ? "Air conditioning not reported" : isNone(ac) ? "No air conditioning" : `Air conditioning: ${sentenceCase(ac).toLowerCase()}`;
  const room = r.has_cooling_room == null ? "cooling room not reported" : r.has_cooling_room ? "has a cooling room" : "no cooling room";
  return `${acText}; ${room}.`;
}

function ownerType(t: string | null) {
  if (!t) return "Not reported";
  const u = t.toUpperCase();
  if (u === "TCHC") return "Toronto Community Housing";
  if (u === "SOCIAL HOUSING") return "Social housing";
  return sentenceCase(t);
}
