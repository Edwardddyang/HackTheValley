import Link from "next/link";

import type { AddressMatch, Brief } from "@/lib/brief";
import { OFFENCE_LABELS, compactMoney, date, metres, money, month, num, titleCase } from "@/lib/format";

import { Cite } from "./Cite";
import { MapPanel } from "./MapPanel";
import { BarList, CompareBar, Empty, Pill, Section, Stat } from "./ui";

const NAV = [
  ["building", "Building"],
  ["nearby-buildings", "Nearby buildings"],
  ["construction", "Construction"],
  ["development", "Development"],
  ["requests", "311"],
  ["crime", "Crime"],
  ["census", "Neighbourhood"],
] as const;

export function BriefView({ brief, alternatives, radius }: { brief: Brief; alternatives: AddressMatch[]; radius: number }) {
  const typeLabels = brief.development_applications.type_labels;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="h-[55vh] lg:sticky lg:top-[88px] lg:h-[calc(100vh-112px)]">
        <MapPanel brief={brief} typeLabels={typeLabels} />
      </div>

      <div className="min-w-0 space-y-4">
        <Header brief={brief} alternatives={alternatives} radius={radius} />
        <BuildingSection brief={brief} />
        <NearbyBuildingsSection brief={brief} />
        <ConstructionSection brief={brief} />
        <DevelopmentSection brief={brief} />
        <RequestsSection brief={brief} />
        <CrimeSection brief={brief} />
        <CensusSection brief={brief} />
        <AddressPermitsSection brief={brief} />
        <p className="px-1 pb-8 text-[12px] leading-relaxed text-ink-3">
          Every figure comes from City of Toronto open data and Toronto Police Service data; hover a source tag to
          see the dataset, file and row. Nothing here is estimated or generated.
        </p>
      </div>
    </div>
  );
}

function Header({ brief, alternatives, radius }: { brief: Brief; alternatives: AddressMatch[]; radius: number }) {
  const { address, area } = brief;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {address.address}
        <Cite cite={address.cite} />
      </h1>
      <p className="mt-1 text-sm text-ink-2">
        {area.neighbourhood ? (
          <>
            {area.neighbourhood.name}
            <Cite cite={area.neighbourhood.cite} />
          </>
        ) : null}
        {area.ward ? (
          <>
            {" · "}Ward {area.ward.ward_number} {area.ward.name}
            <Cite cite={area.ward.cite} />
          </>
        ) : null}
        {" · "}within {metres(address.radius_m)}
      </p>
      {alternatives.length > 0 && (
        <p className="mt-3 text-[13px] text-ink-3">
          Not the right place?{" "}
          {alternatives.slice(0, 3).map((a, i) => (
            <span key={a.address_point_id}>
              {i > 0 ? " · " : ""}
              <Link className="text-accent hover:underline"
                href={`/?id=${a.address_point_id}&address=${encodeURIComponent(a.address)}&r=${radius}`}>
                {a.address}
              </Link>
            </span>
          ))}
        </p>
      )}
      <nav aria-label="Sections" className="mt-4 flex flex-wrap gap-1.5">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`}
            className="rounded-full border border-border px-2.5 py-1 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function BuildingSection({ brief }: { brief: Brief }) {
  const b = brief.building;
  if (!b.in_rentsafe) {
    return (
      <Section id="building" title="This building">
        <Empty>{b.note}</Empty>
      </Section>
    );
  }
  const e = b.latest_evaluation;
  return (
    <Section id="building" title="This building · RentSafeTO evaluation"
      subtitle="City inspection of common areas, exterior and maintenance records. Scored 0–100.">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <Stat value={<>{num(e.score)}<span className="text-lg font-normal text-ink-3">/100</span></>}
          label={`Evaluated ${date(e.date)}`} cite={e.cite} />
        {e.percent_of_buildings_scoring_lower != null && (
          <Stat value={`${e.percent_of_buildings_scoring_lower}%`}
            label="of evaluated buildings score lower (latest evaluations, 2023+ scoring)" />
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-4">
        {[["Built", b.year_built ?? "—"], ["Storeys", num(b.storeys)], ["Units", num(b.units)], ["Type", titleCase(b.property_type)]].map(([k, v]) => (
          <div key={String(k)}>
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {e.lowest_items?.length ? (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Lowest-scoring items in this evaluation</h3>
          <ul className="space-y-1.5">
            {e.lowest_items.map((it) => (
              <li key={it.item} className="flex items-center justify-between gap-4 text-[13px]">
                <span className="text-ink">{titleCase(it.item)}</span>
                <span className="flex items-center gap-2 tabular-nums text-ink-2">
                  <span className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: e.item_scale_max }, (_, i) => (
                      <span key={i} className={`h-2 w-3 rounded-sm ${i < it.score ? "bg-ink-2" : "bg-surface-2"}`} />
                    ))}
                  </span>
                  {it.score} of {e.item_scale_max}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {b.history.length > 1 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Evaluation history</h3>
          <ul className="flex flex-wrap gap-2">
            {b.history.map((h, i) => (
              <li key={i}>
                <Pill>
                  {month(h.date)}: <span className="ml-1 font-medium text-ink">{num(h.score)}</span>
                  <Cite cite={h.cite} />
                </Pill>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink-3">Evaluations before 2023 used a different scoring system.</p>
        </div>
      )}
    </Section>
  );
}

function NearbyBuildingsSection({ brief }: { brief: Brief }) {
  const list = brief.rentsafe_nearby.buildings.filter((b) => b.distance_m > 0 || !brief.building.in_rentsafe);
  return (
    <Section id="nearby-buildings" title="Evaluated apartment buildings nearby"
      subtitle={`${list.length} RentSafeTO building${list.length === 1 ? "" : "s"} within ${metres(brief.address.radius_m)}, nearest first`}>
      {list.length === 0 ? (
        <Empty>No RentSafeTO-evaluated buildings in this radius.</Empty>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="pb-2 font-normal">Address</th>
              <th className="pb-2 font-normal">Score</th>
              <th className="pb-2 text-right font-normal">Distance</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 8).map((b) => (
              <tr key={b.rsn} className="border-t border-hairline">
                <td className="py-1.5 pr-3 text-ink">
                  {titleCase(b.address)}
                  <Cite cite={b.cite} />
                </td>
                <td className="w-2/5 py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 tabular-nums text-ink">{num(b.score)}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-surface-2">
                      <div className="h-1.5 rounded-full bg-ink-2" style={{ width: `${b.score ?? 0}%` }} />
                    </div>
                  </div>
                  {b.scoring === "pre-2023" ? <div className="text-[11px] text-ink-3">pre-2023 scoring</div> : null}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-2">{metres(b.distance_m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.length > 8 && <p className="mt-2 text-[12px] text-ink-3">{list.length - 8} more on the map.</p>}
    </Section>
  );
}

function ConstructionSection({ brief }: { brief: Brief }) {
  const c = brief.construction_nearby;
  return (
    <Section id="construction" title="Construction nearby" subtitle={`Active building permits within ${metres(brief.address.radius_m)}`}>
      <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <Stat value={num(c.active_permit_count)} label="active permits" cite={c.cite} />
        {c.by_type.length ? (
          <BarList color="var(--series-permit)" items={c.by_type.map((t) => ({ label: t.type, count: t.count }))} />
        ) : null}
      </div>
      <h3 className="mb-2 mt-6 text-[13px] font-medium text-ink-2">Major projects</h3>
      <p className="mb-3 text-[12px] text-ink-3">{c.notable_definition}.</p>
      {c.notable.length === 0 ? (
        <Empty>None in this radius.</Empty>
      ) : (
        <ul className="divide-y divide-hairline">
          {c.notable.map((p) => (
            <li key={p.permit_num + p.type} className="py-2.5 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-ink">
                  {titleCase(p.address)}
                  <Cite cite={p.cite} />
                </span>
                <span className="tabular-nums text-ink-3">{metres(p.distance_m)}</span>
              </div>
              <div className="text-ink-2">
                {p.type} · {p.status}
                {p.est_const_cost ? ` · ${compactMoney(p.est_const_cost)} est.` : ""}
                {p.dwelling_units_created ? ` · ${num(p.dwelling_units_created)} new units` : ""}
              </div>
              {p.description ? <p className="mt-0.5 line-clamp-2 text-ink-3">{p.description}</p> : null}
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
      subtitle={`Planning applications within ${metres(brief.address.radius_m)} (rezoning, site plans, condos, subdivisions). A project often has several applications, e.g. a rezoning and a site plan.`}>
      <div className="flex flex-wrap gap-2">
        <Pill>In review: <span className="ml-1 font-medium text-ink">{num(counts.in_review ?? 0)}</span></Pill>
        <Pill>Approved: <span className="ml-1 font-medium text-ink">{num(counts.approved ?? 0)}</span></Pill>
        <Pill>Closed: <span className="ml-1 font-medium text-ink">{num(counts.closed ?? 0)}</span></Pill>
      </div>
      {d.open.length === 0 ? (
        <div className="mt-4"><Empty>No open applications in this radius.</Empty></div>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {d.open.map((a) => (
            <li key={a.application_number + a.type} className="py-2.5 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-ink">
                  {titleCase(a.address)}
                  {a.other_addresses?.length ? (
                    <span className="font-normal text-ink-3" title={a.other_addresses.map(titleCase).join(", ")}>
                      {" "}+ {a.other_addresses.length} more address{a.other_addresses.length === 1 ? "" : "es"}
                    </span>
                  ) : null}
                  <Cite cite={a.cite} />
                </span>
                <span className="tabular-nums text-ink-3">{metres(a.distance_m)}</span>
              </div>
              <div className="text-ink-2">
                {d.type_labels[a.type] ?? a.type} · {a.status} · submitted {date(a.date_submitted)}
                {a.community_meeting_date ? ` · community meeting ${date(a.community_meeting_date)}` : ""}
              </div>
              {a.description ? <p className="mt-0.5 line-clamp-2 text-ink-3">{a.description}</p> : null}
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-accent hover:underline">
                  Application details on toronto.ca
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {d.open.length === 20 && <p className="mt-2 text-[12px] text-ink-3">Showing the 20 most recent open applications.</p>}
    </Section>
  );
}

function RequestsSection({ brief }: { brief: Brief }) {
  const s = brief.service_requests_311;
  const toItems = (types: typeof s.nearby.top_types) =>
    types.map((t) => ({ label: t.type, count: t.count, note: t.still_open ? `${num(t.still_open)} open` : undefined, cite: t.cite }));
  return (
    <Section id="requests" title="311 service requests" subtitle={`Requests to the City, ${date(s.period.from)} – ${date(s.period.to)}`}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Stat value={num(s.nearby.count)} label={`at intersections within ${metres(brief.address.radius_m)}`} />
          <p className="mb-3 mt-2 text-[12px] text-ink-3">{s.nearby.note}</p>
          {s.nearby.top_types.length ? <BarList color="var(--series-311)" items={toItems(s.nearby.top_types)} /> : <Empty>None.</Empty>}
        </div>
        <div>
          <Stat value={num(s.ward.count)} label={`in Ward ${s.ward.ward_number ?? "—"} (all locations)`} />
          <p className="mb-3 mt-2 text-[12px] text-ink-3">Top request types across the whole ward.</p>
          {s.ward.top_types.length ? <BarList color="var(--ink-3)" items={toItems(s.ward.top_types)} /> : <Empty>None.</Empty>}
        </div>
      </div>
    </Section>
  );
}

function CrimeSection({ brief }: { brief: Brief }) {
  const c = brief.crime;
  const hood = brief.area.neighbourhood?.name ?? "this neighbourhood";
  return (
    <Section id="crime" title={`Crime in ${hood}, ${c.year}`}
      subtitle={<>Incidents per 100,000 people. Bar: {hood}; tick: all of Toronto.</>}>
      {c.offences.length === 0 ? (
        <Empty>No crime data for this neighbourhood.</Empty>
      ) : (
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {c.offences.map((o) => {
            const max = Math.max(o.rate_per_100k, o.city_rate_per_100k ?? 0) * 1.15;
            const change = o.previous_year_rate != null ? o.rate_per_100k - o.previous_year_rate : null;
            return (
              <li key={o.offence} className="text-[13px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-ink">
                    {OFFENCE_LABELS[o.offence] ?? o.offence}
                    <Cite cite={o.cite} />
                  </span>
                  <span className="tabular-nums text-ink">
                    {num(o.rate_per_100k)}
                    <span className="ml-1.5 text-ink-3">city {num(o.city_rate_per_100k)}</span>
                  </span>
                </div>
                <CompareBar value={o.rate_per_100k} compare={o.city_rate_per_100k} max={max}
                  valueLabel={`${hood}: ${num(o.rate_per_100k)}`} compareLabel={`Toronto: ${num(o.city_rate_per_100k)}`} />
                <div className="mt-1 text-[12px] text-ink-3">
                  {num(o.count)} incident{o.count === 1 ? "" : "s"}
                  {change != null ? ` · rate ${change === 0 ? "same as" : `${change > 0 ? "up" : "down"} ${num(Math.abs(Math.round(change * 10) / 10))} from`} ${c.year - 1}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[12px] text-ink-3">{c.note}</p>
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
      subtitle={<>2021 Census{pop ? <> · population {num(pop)}<Cite cite={values.population?.cite} /></> : null}. Bar: {hood}; tick: median of Toronto&apos;s 158 neighbourhoods.</>}>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {CENSUS_ROWS.filter((r) => values[r.key]).map((r) => {
          const v = values[r.key];
          const shown = r.kind === "percent" ? v.percent ?? v.value : v.value;
          const median = v.toronto_neighbourhood_median;
          const fmt = (n: number | null | undefined) =>
            n == null ? "—" : r.kind === "money" ? money(n) : r.kind === "percent" ? `${num(Math.round(n * 10) / 10)}%` : num(n);
          const max = r.kind === "percent" ? 100 : Math.max(shown ?? 0, median ?? 0) * 1.25;
          return (
            <li key={r.key} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-ink">
                  {r.label}
                  <Cite cite={v.cite} />
                </span>
                <span className="shrink-0 tabular-nums text-ink">
                  {fmt(shown)}
                  <span className="ml-1.5 text-ink-3">median {fmt(median)}</span>
                </span>
              </div>
              <CompareBar value={shown ?? null} compare={median} max={max}
                valueLabel={`${hood}: ${fmt(shown)}`} compareLabel={`Neighbourhood median: ${fmt(median)}`} />
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[12px] text-ink-3">{brief.census.source_note}</p>
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
            <li key={i.permit_num + i.type + i.status} className="py-2 text-[13px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-ink">
                  {i.type}
                  <Cite cite={i.cite} />
                </span>
                <span className="text-ink-3">{i.group === "active" ? "Active" : `Completed ${date(i.completed_date)}`}</span>
              </div>
              <div className="text-ink-2">
                {i.work ?? "—"} · {i.status}
                {i.est_const_cost ? ` · ${compactMoney(i.est_const_cost)} est.` : ""}
              </div>
              {i.description ? <p className="mt-0.5 line-clamp-2 text-ink-3">{i.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
