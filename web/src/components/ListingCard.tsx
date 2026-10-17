import Link from "next/link";

import type { Extras } from "@/lib/extras";
import { BEDROOM_NOUN, bedroomsKey, bedroomsLabel, money } from "@/lib/format";

import { Cite } from "./Cite";
import { Note, Section } from "./ui";

type Benchmark = NonNullable<Extras["rent_benchmark"]>;

/**
 * The asking rent from the listing, against CMHC's October survey. New leases are compared with
 * the rent of units that were vacant at survey time (the closest public figure to a new lease);
 * the all-units average includes long-time tenants on controlled rents, so it is context only.
 */
export function ListingCard({ rent, beds, benchmark }: { rent: number | null; beds: number | null; benchmark: Benchmark | null }) {
  const key = beds == null ? null : bedroomsKey(beds);
  const row = benchmark && key ? benchmark.by_bedrooms[key] : null;
  const vacant = row?.vacant_units ?? null;
  const all = row?.all_units ?? null;
  const compareTo = vacant ?? all;
  const diff = rent != null && compareTo != null ? rent - compareTo : null;
  const pct = diff != null && compareTo ? Math.round((Math.abs(diff) / compareTo) * 100) : null;
  const diffText = diff == null ? "" : diff === 0 ? "the same as" : `${money(Math.abs(diff))} (${pct}%) ${diff > 0 ? "more" : "less"} than`;
  // "Former City of Toronto (Zones 1-4)" -> "the former City of Toronto" for use mid-sentence.
  const area = benchmark?.area.replace(/\s*\(Zones? [^)]*\)/, "").replace(/^Former /, "the former ");
  const noun = key ? BEDROOM_NOUN[key] : null;

  return (
    <Section id="listing" title="Your listing" subtitle="From the ad you pasted. Check these against the lease before you sign.">
      <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div>
          <dt className="text-[15px] text-ink-2">Asking rent</dt>
          <dd className="plate num mt-1 text-[2.2rem] font-bold text-ink">
            {rent != null ? money(rent) : "Not stated"}
            {rent != null && <span className="font-sans text-base font-normal text-ink-2"> a month</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[15px] text-ink-2">Bedrooms</dt>
          <dd className="plate mt-1 text-[2.2rem] font-bold text-ink">{beds != null ? bedroomsLabel(beds) : "Not stated"}</dd>
        </div>
      </dl>

      {!benchmark ? (
        <p className="mt-4 rounded-md bg-surface-2 px-4 py-3 text-[15px] text-ink-2">
          CMHC area rents aren&apos;t available for this address right now, so there&apos;s nothing to compare the asking rent with.
        </p>
      ) : rent == null || key == null ? (
        <p className="mt-4 max-w-[64ch] text-[15px] text-ink-2">
          The listing didn&apos;t give {rent == null ? "a rent" : "a bedroom count"}, so it can&apos;t be compared with CMHC&apos;s area rents.
        </p>
      ) : compareTo == null ? (
        <p className="mt-4 max-w-[64ch] text-[15px] text-ink-2">
          CMHC doesn&apos;t publish a rent for {noun} apartments in {area}.
        </p>
      ) : (
        <>
          <p className="mt-4 max-w-[64ch] text-[15px] text-ink">
            {vacant != null ? (
              <>
                In October {benchmark.survey_year}, {noun} apartments in {area} that were vacant and up for rent averaged{" "}
                <strong className="num">{money(vacant)}</strong> a month
                {all != null && <> (<span className="num">{money(all)}</span> across all units, including long-time tenants)</>}.
              </>
            ) : (
              <>
                CMHC didn&apos;t publish a vacant-unit rent for {noun} apartments in {area}. The average across all units
                was <strong className="num">{money(all)}</strong> in October {benchmark.survey_year}; it includes long-time
                tenants, so new listings usually ask more.
              </>
            )}
            <Cite cite={benchmark.cite} />{" "}
            This listing asks{" "}
            <strong className="num">{diffText}</strong> {vacant != null ? "the vacant-unit average" : "the all-units average"}.
          </p>
          <Note>
            {benchmark.survey}, purpose-built rental apartments in {benchmark.area}. Condos and basement units rent
            differently, and the area is much bigger than one block.{" "}
            <Link href="/sources#cmhc_rents" className="text-accent underline underline-offset-2">About this data</Link>
          </Note>
        </>
      )}
    </Section>
  );
}
