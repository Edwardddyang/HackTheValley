import Link from "next/link";

import type { AddressMatch, Brief } from "@/lib/brief";
import type { Extras } from "@/lib/extras";
import { OFFENCE_LABELS, compactMoney, date, metres, money, num, titleCase } from "@/lib/format";

import { ChecklistPanel, SummaryPanel, SummaryProvider } from "./AiSummary";
import { BuildingSection } from "./BuildingSection";
import { Cite } from "./Cite";
import { LimitsPanel } from "./LimitsPanel";
import { ListingCard } from "./ListingCard";
import { MapPanel } from "./MapPanel";
import { ShowOnMap } from "./ShowOnMap";
import { BarList, CompareBar, Empty, Note, Pill, Section, Stat } from "./ui";

export type ListingHints = { rent: number | null; beds: number | null };

export function BriefView({ brief, extras, alternatives, radius, listing, fixture = false }: {
  brief: Brief; extras: Extras | null; alternatives: AddressMatch[]; radius: number;
  listing: ListingHints; fixture?: boolean;
}) {
  const typeLabels = brief.development_applications.type_labels;
  const hasListing = listing.rent != null || listing.beds != null;
  const asOf = brief.service_requests_311.period.to ?? (brief.building.in_rentsafe ? brief.building.latest_evaluation.date : null);
  const asOfYear = asOf ? Number(asOf.slice(0, 4)) : null;

  const nav: [string, string][] = [
    ...(hasListing ? [["listing", "Your listing"] as [string, string]] : []),
    ["summary", "In plain language"],
    ["building", "Building"],
    ["checklist", "Viewing questions"],
    ["nearby-buildings", "Nearby buildings"],
    ["construction", "Construction"],
    ["development", "Development"],
    ["requests", "311 in the area"],
    ["crime", "Crime"],
    ["census", "Neighbourhood"],
    ["limits", "Limits"],
  ];

  return (
    <SummaryProvider key={`${brief.address.address_point_id}-${radius}`} addressPointId={brief.address.address_point_id} radius={brief.address.radius_m}>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 lg:col-start-2">
          {fixture && <FixtureBanner />}
          <Header brief={brief} alternatives={alternatives} radius={radius} nav={nav} listing={listing} />
        </div>

        <div role="region" aria-label={`Map of ${brief.address.address} and ${metres(brief.address.radius_m)} around it`}
          className="h-[45vh] min-h-[280px] lg:sticky lg:top-[88px] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-[calc(100vh-112px)] lg:self-start">
          <p className="sr-only">The map shows the items listed in the sections of this brief: evaluated buildings, major construction, open development applications and 311 requests placed at intersections.</p>
          <MapPanel brief={brief} typeLabels={typeLabels} />
        </div>

        <div className="min-w-0 space-y-12 lg:col-start-2">
          {hasListing && <ListingCard rent={listing.rent} beds={listing.beds} benchmark={extras?.rent_benchmark ?? null} />}
          <SummaryPanel />
          <BuildingSection brief={brief} extras={extras} asOfYear={asOfYear} />
          <ChecklistPanel address={brief.address.address} />
          <NearbyBuildingsSection brief={brief} />
          <ConstructionSection brief={brief} />
          <DevelopmentSection brief={brief} />
          <RequestsSection brief={brief} />
          <CrimeSection brief={brief} />
          <CensusSection brief={brief} />
          <AddressPermitsSection brief={brief} />
          <LimitsPanel />
          <p className="pb-4 text-sm leading-relaxed text-ink-2">
            Facts come from City of Toronto open data, Toronto Police Service data and CMHC&apos;s Rental Market Survey.
            Hover or focus a source tag to see the dataset, file and row. Only the plain-language summary and the
            viewing questions are written by AI, and they cite the same records.
          </p>
        </div>
      </div>
    </SummaryProvider>
  );
}

function FixtureBanner() {
  return (
    <p role="note" className="mb-4 rounded-md border-l-4 border-amber bg-amber-tint px-4 py-3 text-[15px] text-ink">
      <strong>Development data.</strong> No Supabase key is set, so every search shows the saved brief for 375 Brunswick
      Ave. Add <code>web/.env.local</code> (see <code>.env.example</code>) for live data.
    </p>
  );
}

function Header({ brief, alternatives, radius, nav, listing }: {
  brief: Brief; alternatives: AddressMatch[]; radius: number; nav: [string, string][]; listing: ListingHints;
}) {
  const { address, area } = brief;
  const keep = `${listing.rent != null ? `&rent=${listing.rent}` : ""}${listing.beds != null ? `&beds=${listing.beds}` : ""}`;
  return (
    <div>
      <p className="text-[15px] text-ink-2">Before-you-sign brief</p>
      <h1 className="plate mt-1 break-words text-[clamp(2.4rem,8vw,3.75rem)] font-bold text-ink">
        {address.address}
        <Cite cite={address.cite} />
      </h1>
      <p className="mt-2 text-[15px] text-ink-2">
        {area.neighbourhood ? (
          <>
            {area.neighbourhood.name}
            <Cite cite={area.neighbourhood.cite} />
            {area.ward ? ", " : ""}
          </>
        ) : null}
        {area.ward ? (
          <>
            Ward {area.ward.ward_number} {area.ward.name}
            <Cite cite={area.ward.cite} />
          </>
        ) : null}
        . Nearby means within {metres(address.radius_m)} of the address.
      </p>
      {alternatives.length > 0 && (
        <p className="mt-3 text-[15px] text-ink-2">
          Not the right place?{" "}
          {alternatives.slice(0, 3).map((a, i) => (
            <span key={a.address_point_id}>
              {i > 0 ? ", " : ""}
              <Link className="text-accent underline underline-offset-2"
                href={`/?id=${a.address_point_id}&address=${encodeURIComponent(a.address)}&r=${radius}${keep}`}>
                {a.address}
              </Link>
            </span>
          ))}
        </p>
      )}
      <nav aria-label="Sections of this brief" className="no-print mt-4">
        <ul className="flex flex-wrap gap-1.5">
          {nav.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}
                className="inline-block rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink-2 hover:border-ink hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NearbyBuildingsSection({ brief }: { brief: Brief }) {
  // Leave out this building itself (it is the section above).
  const self = brief.building.in_rentsafe ? brief.building.rsn : null;
  const list = brief.rentsafe_nearby.buildings.filter((b) => b.rsn !== self);
  return (
    <Section id="nearby-buildings" title="Evaluated buildings nearby"
      subtitle={`${num(list.length)} RentSafeTO building${list.length === 1 ? "" : "s"} within ${metres(brief.address.radius_m)}, nearest first. On the map, each dark circle shows its score.`}>
      {list.length === 0 ? (
        <Empty>No RentSafeTO-evaluated buildings in this radius.</Empty>
      ) : (
        <table className="w-full text-[15px]">
          <caption className="sr-only">RentSafeTO scores of apartment buildings nearby, out of 100</caption>
          <thead>
            <tr className="text-left text-sm text-ink-2">
              <th scope="col" className="pb-2 font-semibold">Address</th>
              <th scope="col" className="pb-2 font-semibold">Score</th>
              <th scope="col" className="pb-2 text-right font-semibold">Distance</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 8).map((b) => (
              <tr key={b.rsn} className="border-t border-hairline">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-ink">
                  {titleCase(b.address)}
                  <Cite cite={b.cite} />
                  <ShowOnMap lon={b.lon} lat={b.lat} layer="rentsafe" label={titleCase(b.address)} />
                </th>
                <td className="w-2/5 py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="num w-7 text-ink">{num(b.score)}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-surface-2" aria-hidden="true">
                      <div className="h-1.5 rounded-full bg-ink-2" style={{ width: `${b.score ?? 0}%` }} />
                    </div>
                  </div>
                  {b.scoring === "pre-2023" ? <div className="text-xs text-ink-2">pre-2023 scoring</div> : null}
                </td>
                <td className="num py-2 text-right text-ink-2">{metres(b.distance_m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.length > 8 && <Note>{num(list.length - 8)} more on the map.</Note>}
    </Section>
  );
}

function ConstructionSection({ brief }: { brief: Brief }) {
  const c = brief.construction_nearby;
  return (
    <Section id="construction" title="Construction nearby"
      subtitle={`Open building permits within ${metres(brief.address.radius_m)}. Construction can mean noise, dust and closed sidewalks for months.`}>
      <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Stat value={num(c.active_permit_count)} label="active permits" cite={c.cite} />
        {c.by_type.length ? (
          <BarList color="var(--series-permit)" items={c.by_type.map((t) => ({ label: t.type, count: t.count }))} />
        ) : null}
      </div>
      <h3 className="plate mt-8 text-[1.35rem] font-bold text-ink">Major projects</h3>
      <p className="mb-2 mt-1 text-sm text-ink-2">{c.notable_definition}. Marked P on the map.</p>
      {c.notable.length === 0 ? (
        <Empty>None in this radius.</Empty>
      ) : (
        <ul className="divide-y divide-hairline">
          {c.notable.map((p) => (
            <li key={p.permit_num + p.type} className="py-3 text-[15px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-ink">
                  {titleCase(p.address)}
                  <Cite cite={p.cite} />
                  <ShowOnMap lon={p.lon} lat={p.lat} layer="permits" label={p.address ?? "this project"} />
                </span>
                <span className="num text-sm text-ink-2">{metres(p.distance_m)}</span>
              </div>
              <div className="text-ink-2">
                {[p.type, p.status, p.est_const_cost ? `${compactMoney(p.est_const_cost)} estimated` : null,
                  p.dwelling_units_created ? `${num(p.dwelling_units_created)} new homes` : null].filter(Boolean).join(", ")}
              </div>
              {p.description ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{p.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function DevelopmentSection({ brief }: { brief: Brief }) {
  const d = brief.development_applications;
  const counts = d.counts ?? {};
  return (
    <Section id="development" title="Development applications"
      subtitle={`Planning applications within ${metres(brief.address.radius_m)}: rezonings, site plans, condos and subdivisions. An application isn't an approval, and one project often has several. Open ones are marked A on the map.`}>
      <ul className="flex flex-wrap gap-2">
        <li><Pill>In review: <span className="num ml-1 font-semibold text-ink">{num(counts.in_review ?? 0)}</span></Pill></li>
        <li><Pill>Approved: <span className="num ml-1 font-semibold text-ink">{num(counts.approved ?? 0)}</span></Pill></li>
        <li><Pill>Closed: <span className="num ml-1 font-semibold text-ink">{num(counts.closed ?? 0)}</span></Pill></li>
      </ul>
      {d.open.length === 0 ? (
        <div className="mt-4"><Empty>No open applications in this radius.</Empty></div>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {d.open.map((a) => (
            <li key={a.application_number + a.type} className="py-3 text-[15px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-ink">
                  {titleCase(a.address)}
                  {a.other_addresses?.length ? (
                    <span className="font-normal text-ink-2" title={a.other_addresses.map(titleCase).join(", ")}>
                      {" "}and {a.other_addresses.length} more address{a.other_addresses.length === 1 ? "" : "es"}
                    </span>
                  ) : null}
                  <Cite cite={a.cite} />
                  <ShowOnMap lon={a.lon} lat={a.lat} layer="devapps" label={a.address ?? "this application"} />
                </span>
                <span className="num text-sm text-ink-2">{metres(a.distance_m)}</span>
              </div>
              <div className="text-ink-2">
                {d.type_labels[a.type] ?? a.type}, {a.status}, submitted {date(a.date_submitted)}
                {a.community_meeting_date ? <>. <strong className="font-semibold text-ink">Community meeting {date(a.community_meeting_date)}</strong></> : null}
              </div>
              {a.description ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{a.description}</p> : null}
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-accent underline underline-offset-2">
                  Application details on toronto.ca<span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {d.open.length === 20 && <Note>Showing the 20 most recent open applications.</Note>}
    </Section>
  );
}

function RequestsSection({ brief }: { brief: Brief }) {
  const s = brief.service_requests_311;
  const toItems = (types: typeof s.nearby.top_types) =>
    types.map((t) => ({ label: t.type, count: t.count, note: t.still_open ? `${num(t.still_open)} still open` : undefined, cite: t.cite }));
  return (
    <Section id="requests" title="311 requests in the area"
      subtitle={<>Requests to the City from {date(s.period.from)} to {date(s.period.to)}. 311 records only a postal area or the nearest intersection, never the address, so these counts describe the area around the building, <strong className="font-semibold text-ink">not the building itself</strong>.</>}>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <Stat value={num(s.nearby.count)} label={`reported at street intersections within ${metres(brief.address.radius_m)}`} />
          <Note>{s.nearby.note}</Note>
          <div className="mt-3">
            {s.nearby.top_types.length ? <BarList color="var(--series-311)" items={toItems(s.nearby.top_types)} /> : <Empty>None.</Empty>}
          </div>
        </div>
        <div>
          <Stat value={num(s.ward.count)} label={`across Ward ${s.ward.ward_number ?? "—"}, every location type`} />
          <Note>The most common request types in the whole ward.</Note>
          <div className="mt-3">
            {s.ward.top_types.length ? <BarList color="var(--ink-2)" items={toItems(s.ward.top_types)} /> : <Empty>None.</Empty>}
          </div>
        </div>
      </div>
      <Note>
        &ldquo;Still open&rdquo; is each request&apos;s status when the City published the file. The data has no closed
        date, so it can&apos;t show how quickly requests were dealt with. Counts also reflect who calls 311, not only what
        happens.
      </Note>
    </Section>
  );
}

function CrimeSection({ brief }: { brief: Brief }) {
  const c = brief.crime;
  const hood = brief.area.neighbourhood?.name ?? "this neighbourhood";
  return (
    <Section id="crime" title={`Crime in ${hood}, ${c.year}`}
      subtitle={<>Incidents per 100,000 people across the whole neighbourhood, not this street. Bar: {hood}; tick: all of Toronto.</>}>
      {c.offences.length === 0 ? (
        <Empty>No crime data for this neighbourhood.</Empty>
      ) : (
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {c.offences.map((o) => {
            const max = Math.max(o.rate_per_100k, o.city_rate_per_100k ?? 0) * 1.15;
            const change = o.previous_year_rate != null ? o.rate_per_100k - o.previous_year_rate : null;
            return (
              <li key={o.offence} className="text-[15px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-ink">
                    {OFFENCE_LABELS[o.offence] ?? o.offence}
                    <Cite cite={o.cite} />
                  </span>
                  <span className="num shrink-0 text-ink">
                    {num(o.rate_per_100k)}
                    <span className="ml-1.5 text-sm text-ink-2">Toronto {num(o.city_rate_per_100k)}</span>
                  </span>
                </div>
                <CompareBar value={o.rate_per_100k} compare={o.city_rate_per_100k} max={max}
                  valueLabel={`${hood}: ${num(o.rate_per_100k)}`} compareLabel={`Toronto: ${num(o.city_rate_per_100k)}`} />
                <div className="mt-1 text-sm text-ink-2">
                  {num(o.count)} incident{o.count === 1 ? "" : "s"}
                  {change != null ? `, rate ${change === 0 ? "same as" : `${change > 0 ? "up" : "down"} ${num(Math.abs(Math.round(change * 10) / 10))} from`} ${c.year - 1}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Note>{c.note}</Note>
    </Section>
  );
}

const CENSUS_ROWS: { key: string; label: string; kind: "percent" | "money" | "number" }[] = [
  { key: "median_rent_monthly", label: "Median monthly shelter cost, renters", kind: "money" },
  { key: "renter_households", label: "Households that rent", kind: "percent" },
  { key: "pct_tenants_30pct_on_shelter", label: "Renters spending 30%+ of income on housing", kind: "percent" },
  { key: "pct_tenants_subsidized", label: "Renters in subsidized housing", kind: "percent" },
  { key: "median_household_income", label: "Median household income (2020)", kind: "money" },
  { key: "apartments_5plus_storeys", label: "Homes in buildings of 5+ storeys", kind: "percent" },
  { key: "dwellings_major_repairs", label: "Homes needing major repairs", kind: "percent" },
  { key: "commute_transit", label: "Commute by transit", kind: "percent" },
  { key: "commute_walk", label: "Commute on foot", kind: "percent" },
  { key: "commute_bicycle", label: "Commute by bicycle", kind: "percent" },
];

function CensusSection({ brief }: { brief: Brief }) {
  const values = brief.census.values ?? {};
  const hood = brief.area.neighbourhood?.name ?? "This neighbourhood";
  const pop = values.population?.value;
  return (
    <Section id="census" title={`${hood} at a glance`}
      subtitle={<>2021 Census{pop ? <>, population {num(pop)}<Cite cite={values.population?.cite} /></> : null}. Bar: {hood}; tick: median of Toronto&apos;s 158 neighbourhoods.</>}>
      <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {CENSUS_ROWS.filter((r) => values[r.key]).map((r) => {
          const v = values[r.key];
          const shown = r.kind === "percent" ? v.percent ?? v.value : v.value;
          const median = v.toronto_neighbourhood_median;
          const fmt = (n: number | null | undefined) =>
            n == null ? "—" : r.kind === "money" ? money(n) : r.kind === "percent" ? `${num(Math.round(n * 10) / 10)}%` : num(n);
          const max = r.kind === "percent" ? 100 : Math.max(shown ?? 0, median ?? 0) * 1.25;
          return (
            <li key={r.key} className="text-[15px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ink">
                  {r.label}
                  <Cite cite={v.cite} />
                </span>
                <span className="num shrink-0 text-ink">
                  {fmt(shown)}
                  <span className="ml-1.5 text-sm text-ink-2">median {fmt(median)}</span>
                </span>
              </div>
              <CompareBar value={shown ?? null} compare={median} max={max}
                valueLabel={`${hood}: ${fmt(shown)}`} compareLabel={`Neighbourhood median: ${fmt(median)}`} />
            </li>
          );
        })}
      </ul>
      <Note>{brief.census.source_note}</Note>
    </Section>
  );
}

function AddressPermitsSection({ brief }: { brief: Brief }) {
  const p = brief.permits_at_address;
  return (
    <Section id="address-permits" title="Permits at this address" subtitle={p.note}>
      {p.items.length === 0 ? (
        <Empty>No permits on record for this exact address.</Empty>
      ) : (
        <ul className="divide-y divide-hairline">
          {p.items.map((i) => (
            <li key={i.permit_num + i.type + i.status} className="py-2.5 text-[15px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold text-ink">
                  {i.type}
                  <Cite cite={i.cite} />
                </span>
                <span className="text-sm text-ink-2">{i.group === "active" ? "Active" : `Completed ${date(i.completed_date)}`}</span>
              </div>
              <div className="text-ink-2">
                {[i.work ?? "—", i.status, i.est_const_cost ? `${compactMoney(i.est_const_cost)} estimated` : null].filter(Boolean).join(", ")}
              </div>
              {i.description ? <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{i.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
