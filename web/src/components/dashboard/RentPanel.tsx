import { Cite } from "@/components/Cite";
import type { Extras } from "@/lib/extras";
import { BEDROOM_NOUN, bedroomsKey, bedroomsLabel, money } from "@/lib/format";
import type { ListingHints } from "@/lib/listing-params";

import { DashboardPanel, SourceNote, Unavailable } from "./DashboardPanel";

// Layout from feature/frontend's RentBenchmarksPanel (Satwik); data and comparison rule from integrate/best-of-both's
// ListingCard (Ariaz). A new lease is compared with the rent of units that were vacant at survey time, the closest
// public figure to a new lease; the all-units average includes long-time tenants on older rents, so it is context.

type Benchmark = NonNullable<Extras["rent_benchmark"]>;

const UNIT_TYPES = [
  { key: "studio", label: "Bachelor" },
  { key: "one", label: "1 bedroom" },
  { key: "two", label: "2 bedrooms" },
  { key: "three_plus", label: "3+ bedrooms" },
] as const;

export default function RentPanel({ benchmark, listing }: { benchmark: Benchmark | null; listing: ListingHints }) {
  const { rent, beds } = listing;
  const key = beds == null ? null : bedroomsKey(beds);
  return (
    <DashboardPanel id="rent" wide title="CMHC rent comparison"
      subtitle="CMHC's October survey of purpose-built rental apartments, in CAD per month.">
      {(rent != null || beds != null) && <ListingSummary rent={rent} beds={beds} />}
      {!benchmark ? (
        <Unavailable>CMHC area rents aren&apos;t available for this address, so there&apos;s nothing to compare with.</Unavailable>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <div className="rounded-xl bg-[#F8FAFC] p-4">
              <p className="text-sm font-semibold text-[#142D4E]">{benchmark.area}<Cite cite={benchmark.cite} /></p>
              <p className="mt-1 text-xs text-slate-600">{benchmark.survey}</p>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Average monthly rent by unit type for {benchmark.area}, {benchmark.survey_year}</caption>
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Unit type</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Vacant units<span className="block font-normal">closest to a new lease</span></th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">All units<span className="block font-normal">incl. long-time tenants</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {UNIT_TYPES.map((u) => {
                    const row = benchmark.by_bedrooms[u.key];
                    const mine = u.key === key;
                    return (
                      <tr key={u.key} className={mine ? "bg-teal-50" : undefined}>
                        <th scope="row" className="px-4 py-3 font-medium text-slate-700">
                          {u.label}{mine && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900">your listing</span>}
                        </th>
                        <td className="px-4 py-3 text-right tabular-nums text-[#142D4E]">{row?.vacant_units != null ? money(row.vacant_units) : "Not published"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row?.all_units != null ? money(row.all_units) : "Not published"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Comparison benchmark={benchmark} rent={rent} beds={beds} />
        </div>
      )}
      {benchmark && (
        <>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Survey averages describe purpose-built rental apartments across {benchmark.area}, a much bigger area than one
            block; condos and basement units rent differently. They are not a valuation of this apartment, and included
            utilities may differ.
          </p>
          <SourceNote cite={benchmark.cite} />
        </>
      )}
    </DashboardPanel>
  );
}

function ListingSummary({ rent, beds }: { rent: number | null; beds: number | null }) {
  return (
    <dl className="mb-6 grid max-w-md grid-cols-2 gap-4 rounded-xl border border-slate-200 p-4">
      <div>
        <dt className="text-xs text-slate-500">Asking rent (from your listing)</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums text-[#142D4E]">
          {rent != null ? <>{money(rent)}<span className="text-sm font-normal text-slate-500"> / month</span></> : "Not stated"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Bedrooms</dt>
        <dd className="mt-1 text-2xl font-semibold text-[#142D4E]">{beds != null ? bedroomsLabel(beds) : "Not stated"}</dd>
      </div>
    </dl>
  );
}

function Comparison({ benchmark, rent, beds }: { benchmark: Benchmark; rent: number | null; beds: number | null }) {
  const key = beds == null ? null : bedroomsKey(beds);
  const row = key ? benchmark.by_bedrooms[key] : null;
  const vacant = row?.vacant_units ?? null;
  const all = row?.all_units ?? null;
  const compareTo = vacant ?? all;
  const diff = rent != null && compareTo != null ? rent - compareTo : null;
  const pct = diff != null && compareTo ? Math.round((Math.abs(diff) / compareTo) * 100) : null;
  const diffText = diff == null ? "" : diff === 0 ? "the same as" : `${money(Math.abs(diff))} (${pct}%) ${diff > 0 ? "more" : "less"} than`;
  // "Former City of Toronto (Zones 1-4)" -> "the former City of Toronto" for use mid-sentence.
  const area = benchmark.area.replace(/\s*\(Zones? [^)]*\)/, "").replace(/^Former /, "the former ");
  const noun = key ? BEDROOM_NOUN[key] : null;

  return (
    <div className="rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
      <h3 className="font-semibold text-[#142D4E]">Asking-rent comparison</h3>
      {rent == null && beds == null ? (
        <p className="mt-2">Paste the rental ad on the home page and the asking rent is compared with these figures here.</p>
      ) : rent == null || key == null ? (
        <p className="mt-2">The listing didn&apos;t give {rent == null ? "a rent" : "a bedroom count"}, so it can&apos;t be compared with CMHC&apos;s area rents.</p>
      ) : compareTo == null ? (
        <p className="mt-2">CMHC doesn&apos;t publish a rent for {noun} apartments in {area}.</p>
      ) : (
        <p className="mt-2 text-[#142D4E]">
          {vacant != null ? (
            <>
              In October {benchmark.survey_year}, {noun} apartments in {area} that were vacant and up for rent averaged{" "}
              <strong className="tabular-nums">{money(vacant)}</strong> a month
              {all != null && <> (<span className="tabular-nums">{money(all)}</span> across all units, including long-time tenants)</>}.
            </>
          ) : (
            <>
              CMHC didn&apos;t publish a vacant-unit rent for {noun} apartments in {area}. The average across all units was{" "}
              <strong className="tabular-nums">{money(all)}</strong> in October {benchmark.survey_year}; it includes long-time
              tenants, so new listings usually ask more.
            </>
          )}
          <Cite cite={benchmark.cite} />{" "}
          This listing asks <strong className="tabular-nums">{diffText}</strong> {vacant != null ? "the vacant-unit average" : "the all-units average"}.
        </p>
      )}
    </div>
  );
}
